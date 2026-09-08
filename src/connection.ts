import { AWJinstance } from './index.js'
import * as dgram from 'dgram'
import ky from 'ky'
import URI from 'urijs'
import WebSocket from 'ws'
import { InstanceStatus } from '@companion-module/base'
import { formatAquilonModel } from './util.js'
import * as os from 'os'
import { AWJBackupConnection } from './backupConnection.js'
import { FIRMWARE_TOO_OLD_TEXT } from './config.js'

const fetchDefaultParameters = {
	retry: 2,
	timeout: 15000
}


class AWJconnection {
	instance: AWJinstance
	private websocket: WebSocket | undefined | null
	private wsTimeout: NodeJS.Timeout | undefined
	private addr: string | undefined
	private authcookie = ''
	// Flat 10s retry pause (was an exponential backoff from 100ms up to 16.5s) - simpler/more predictable,
	// and avoids a burst of near-instant retry attempts against a device that just got a Wake-on-LAN packet
	// and needs real time to boot before it can answer at all.
	private readonly reconnectmin = 10_000
	private reconnectinterval = this.reconnectmin
	private countdownTimer: ReturnType<typeof setInterval> | undefined
	// Detects a "zombie" connection - most commonly after the host PC wakes from sleep/standby, where the
	// underlying TCP socket is dead on the wire but the OS/JS side never fires a 'close'/'error' event on its
	// own, so Companion keeps showing green indefinitely. A regular WebSocket ping/pong exchange is the
	// standard way to catch this (see the 'ws' library's own docs on detecting broken connections): if two
	// pings in a row go unanswered, the socket is force-terminated, which does emit 'close' and lets the
	// existing reconnect logic take over normally.
	private readonly heartbeatIntervalMs = 15_000
	private readonly heartbeatMaxMissed = 2
	private heartbeatInterval: ReturnType<typeof setInterval> | undefined
	private heartbeatMissed = 0
	private readonly delimiter = '!' // '\x04'
	private readonly bufferMaxLength = 64_000
	private buffer = ''
	private shouldBeConnected: boolean
	private hadError: boolean
	// Guards the automatic network-scan fallback (see connect()'s catch block) so it fires at most once per
	// "disconnected episode" - reset on a successful connect, not on every 10s retry - so a prolonged outage
	// doesn't turn into hours of repeated subnet sweeps.
	private hasScannedSinceLastFailure = false
	// Separate from the above: prevents two scans ever running at once, even across episode boundaries (e.g.
	// a brief reconnect resets hasScannedSinceLastFailure while a prior scan is still in flight, then the
	// connection drops again immediately) - a scan take a few seconds even on a normal /24, so this matters.
	private isScanningNetwork = false

	/** The Hot Backup Device's own send-only mirror connection - see backupConnection.ts. Lifecycle (start/
	 *  stop/restart on address change) is managed by updateBackupConnection(), called from AWJinstance's
	 *  configUpdated() whenever hotBackupEnabled/hotBackupAddress changes, and once from init(). */
	readonly backupConnection: AWJBackupConnection

	constructor(instance: AWJinstance) {
		this.instance = instance
		this.hadError = false
		this.shouldBeConnected = false
		this.backupConnection = new AWJBackupConnection(instance)
	}

	/** Starts, stops, or restarts the Hot Backup Device's mirror connection to match current config - call
	 *  whenever hotBackupEnabled/hotBackupAddress may have changed. */
	updateBackupConnection(): void {
		const enabled = this.instance.config.hotBackupEnabled
		const addr = this.instance.config.hotBackupAddress?.trim()
		if (enabled && addr) {
			this.backupConnection.start(addr)
		} else {
			this.backupConnection.stop()
		}
	}

	/**
	 * Schedules the next reconnect attempt after `this.reconnectinterval` and keeps the status field's message
	 * ticking down every second in the meantime (the same field that shows "Syncing NNNMB" during a successful
	 * connect) - so it's visible at a glance when the next attempt will happen, rather than a static message
	 * that silently sits there for the whole 10s. `buildMessage` receives the whole-seconds remaining.
	 */
	private scheduleRetryWithCountdown(status: InstanceStatus, buildMessage: (secondsLeft: number) => string): void {
		if (this.wsTimeout) clearTimeout(this.wsTimeout)
		if (this.countdownTimer) clearInterval(this.countdownTimer)

		let secondsLeft = Math.ceil(this.reconnectinterval / 1000)
		this.instance.updateStatus(status, buildMessage(secondsLeft))
		this.countdownTimer = setInterval(() => {
			secondsLeft -= 1
			if (secondsLeft > 0) {
				this.instance.updateStatus(status, buildMessage(secondsLeft))
			} else if (this.countdownTimer) {
				clearInterval(this.countdownTimer)
			}
		}, 1000)

		this.wsTimeout = setTimeout(() => {
			if (this.countdownTimer) clearInterval(this.countdownTimer)
			this.connect(this.addr)
		}, this.reconnectinterval)
	}

	bufferFragment(data: string): void {
		this.buffer += data
		if (this.buffer.length > this.bufferMaxLength) {
			console.log('Incoming Data Buffer overflow, flushing...', this.buffer.length)
			this.buffer = ''
		}
	}
	getNextMessage(): string | null {
		const delimiterIndex = this.buffer.indexOf(this.delimiter)
		if (delimiterIndex !== -1) {
			const message = this.buffer.slice(0, delimiterIndex)
			this.buffer = this.buffer.slice(delimiterIndex + this.delimiter.length)
			return message
		}
		return null
	}

	/** True while the main device's WebSocket is actually open (not just configured) - e.g. for the
	 * "Device - Failover to Hot Backup" action's live device-status info field. */
	get isConnected(): boolean {
		return this.websocket?.readyState === 1
	}

	getURLobj(address: string) {
		if (address.match(/^https?:\/\//) == null) {
			address = 'http://' + address
		}
		const urlObj = new URI(address)
		if (!urlObj.is('domain') && !urlObj.is('ipv4') && !urlObj.is('ipv6')) {
			this.instance.log('warn', 'URL seems invalid')
		}
		if (urlObj.protocol() === 'http' && urlObj.port() === '') {
			urlObj.port('80')
		}
		if (urlObj.protocol() === 'https' && urlObj.port() === '') {
			urlObj.port('443')
		}
		if (urlObj.protocol() !== 'http' && urlObj.protocol() !== 'https') {
			this.instance.log('error', 'Protocol needs to be either http or https but is ' + urlObj.protocol())
			return null
		}
		return urlObj
	}

	/**
	 * For the "Simulated Device?" config checkbox: Analog Way simulators always run on plain http, port 3000
	 * - confirmed live (2026-09-05) that a simulator's https is selectable but doesn't actually work and has
	 * no upside, so this also forces the protocol back to http:// if it was (mistakenly, or leftover from
	 * Secure HTTP) set to https://. Returns `addr` unchanged if it's already http:// on port 3000, otherwise
	 * a corrected address with protocol/port replaced (keeping host/credentials/path intact).
	 */
	ensureSimulatorPort(addr: string): string {
		const withProtocol = addr.match(/^https?:\/\//) ? addr : 'http://' + addr
		const urlObj = new URI(withProtocol)
		if (urlObj.protocol() === 'http' && urlObj.port() === '3000') return addr
		urlObj.protocol('http')
		urlObj.port('3000')
		return urlObj.toString()
	}

	/**
	 * For the "Connect via Secure HTTP/HTTPS?" config checkbox: forces the protocol to https:// and the port
	 * to 443 (confirmed live 2026-09-05: even the simulator's HTTPS runs on 443, not its usual plain-HTTP
	 * 3000). Returns `addr` unchanged if it's already https:// on port 443, otherwise a corrected address
	 * with protocol/port replaced (keeping host/credentials/path intact).
	 */
	ensureSecureHttp(addr: string): string {
		const withProtocol = addr.match(/^https?:\/\//) ? addr : 'http://' + addr
		const urlObj = new URI(withProtocol)
		if (urlObj.protocol() === 'https' && urlObj.port() === '443') return addr
		urlObj.protocol('https')
		urlObj.port('443')
		return urlObj.toString()
	}

	/**
	 * Probes whether an AWJ device is actually reachable at `hostname` on `preferredPort` (whatever the
	 * address currently has - typically 3000, left over from a previous simulator address), falling back to
	 * the other well-known AWJ default (3000 for a simulator, 80 for a real device) if that didn't answer.
	 * Used when the user types a brand new hostname/IP into "Device Network Address" (e.g. switching from a
	 * local simulator to a real Aquilon on the LAN) - without this, index.ts's configUpdated() would blindly
	 * trust the "Simulated Device?" checkbox (possibly still checked from the previous, simulator, session)
	 * and keep forcing port 3000 onto the new, real address. Returns undefined if neither port answers (device
	 * unreachable/powered off right now) - the address is then left exactly as typed, same as before this
	 * existed; the existing connect-retry/network-scan fallback already covers that case once it does connect.
	 * Same lightweight /auth/status probe already used by scanNetworkForDevices(), 400ms timeout, no retry,
	 * http only (this module's own https simulator support has no live devices to probe against there anyway).
	 */
	async detectDevicePort(hostname: string, preferredPort: number): Promise<{ port: number; isSimulated: boolean } | undefined> {
		const check = async (port: number): Promise<boolean> => {
			try {
				const authResponse = await ky.get(`http://${hostname}:${port}/auth/status`, {
					retry: 0,
					timeout: 400,
				}).json<{ [name: string]: any }>()
				return authResponse.authentication?.isAuthenticationEnabled !== undefined
					&& (authResponse.device !== undefined || authResponse.devices?.leader !== undefined)
			} catch {
				return false
			}
		}
		const fallbackPort = preferredPort === 3000 ? 80 : 3000
		if (await check(preferredPort)) return { port: preferredPort, isSimulated: preferredPort === 3000 }
		if (await check(fallbackPort)) return { port: fallbackPort, isSimulated: fallbackPort === 3000 }
		return undefined
	}

	/**
	 * True if `addr`'s hostname is 'localhost'/'127.0.0.1'/'::1', or matches one of this machine's own
	 * current IP addresses on any local interface - a real Aquilon can never be reachable there, so this is
	 * always a simulator running on this same machine (see the "Simulated Device?" config checkbox's
	 * automatic sync in connect()'s success path, and its proactive counterpart in index.ts's configUpdated()).
	 */
	isLocalAddress(addr: string): boolean {
		const urlObj = this.getURLobj(addr)
		if (urlObj === null) return false
		const host = urlObj.hostname()
		if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true
		for (const ifaceList of Object.values(os.networkInterfaces())) {
			for (const iface of ifaceList ?? []) {
				if (iface.address === host) return true
			}
		}
		return false
	}

	/**
	 * Automatic fallback only when the configured address can't be reached (see connect()'s catch block) -
	 * runs at most once per "disconnected episode" (see hasScannedSinceLastFailure), not on every 10s retry,
	 * so a prolonged outage doesn't turn into hours of repeated subnet sweeps. Checks candidates in priority
	 * order (earlier groups awaited to completion before the next starts, so results surface in this order):
	 *   1. localhost:3000 (the Analog Way simulator's own default)
	 *   2. 192.168.2.140:80 (an Aquilon's factory-reset default address)
	 *   3. a bounded neighborhood (NEARBY_SCAN_RADIUS addresses either side, 1021 total) around this
	 *      machine's own address on what looks like "the current network" (best-effort guess only - see
	 *      below), on both port 80 (real device default) and 3000 (simulator default)
	 *   4. the same bounded neighborhood around this machine's other local network interfaces, same two ports
	 * Groups 3-4 are deliberately independent of the interface's actual subnet mask - a /8 or /16 interface
	 * still gets bounded, useful local-vicinity coverage instead of being skipped outright, while a normal
	 * /24 network is still covered in full (254 hosts comfortably fits within the window). Uses the same
	 * /auth/status reachability check connect() itself uses to recognize an AWJ device. Returns every match
	 * found (there can be more than one on a real network).
	 */
	async scanNetworkForDevices(): Promise<{address: string, port: number, model: string}[]> {
		const found: {address: string, port: number, model: string}[] = []
		const alreadyChecked = new Set<string>()

		const checkOne = async (ip: string, port: number): Promise<void> => {
			const key = `${ip}:${port}`
			if (alreadyChecked.has(key)) return
			alreadyChecked.add(key)
			try {
				const authResponse = await ky.get(`http://${ip}:${port}/auth/status`, {
					retry: 0,
					timeout: 400,
				}).json<{[name: string]: any}>()
				const isAuth = authResponse.authentication?.isAuthenticationEnabled
				const deviceObj = authResponse.device || authResponse.devices?.leader
				if (isAuth !== undefined && deviceObj !== undefined) {
					// /auth/status carries no direct isSimulated flag (unlike the full device state) - port
					// 3000 is the Analog Way simulator's own established default, used here as a cheap stand-in.
					const rawModel: string = deviceObj.reference?.label ?? deviceObj.dev ?? 'unknown model'
					const model = port === 3000 ? `${rawModel} (simulated)` : rawModel
					found.push({address: ip, port, model})
				}
			} catch {
				// not reachable / didn't respond like an AWJ device / timed out - the expected outcome for
				// almost every address scanned, not worth logging individually
			}
		}

		const checkBatched = async (pairs: [string, number][]): Promise<void> => {
			const BATCH_SIZE = 32
			for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
				await Promise.allSettled(pairs.slice(i, i + BATCH_SIZE).map(([ip, port]) => checkOne(ip, port)))
			}
		}

		// 1 + 2: the two well-known defaults, checked first regardless of this machine's own subnets
		await checkBatched([['127.0.0.1', 3000], ['192.168.2.140', 80]])

		// 3 + 4: a bounded neighborhood around this machine's own address on each local interface - "current
		// network" is a best-effort guess only (the module has no real way to know which interface the
		// Companion UI's browser is actually on), taken as the first non-internal IPv4 interface Node.js
		// reports; every other qualifying interface follows after.
		const ownAddresses = this.getLocalInterfaceAddresses()
		for (const ownIp of ownAddresses) {
			await checkBatched(this.nearbyHostPorts(ownIp))
		}

		return found
	}

	/**
	 * [ip, port] pairs for a bounded window of NEARBY_RADIUS addresses on either side of `centerIp` (1021
	 * addresses total including the center, on both ports 80 and 3000) - deliberately independent of the
	 * interface's actual subnet mask, so a /8 or /16 interface still gets bounded, useful local-vicinity
	 * coverage instead of being skipped outright, while a normal /24 network is still covered in full (254
	 * hosts comfortably fits within a 1021-address window centered on this machine's own address in it).
	 */
	private static readonly NEARBY_SCAN_RADIUS = 510

	private nearbyHostPorts(centerIp: string): [string, number][] {
		const center = this.ipToInt(centerIp)
		const pairs: [string, number][] = []
		for (let offset = -AWJconnection.NEARBY_SCAN_RADIUS; offset <= AWJconnection.NEARBY_SCAN_RADIUS; offset++) {
			const candidate = center + offset
			if (candidate < 0 || candidate > 0xffffffff) continue // don't wrap past the address space's edges
			const ip = this.intToIp(candidate)
			pairs.push([ip, 80], [ip, 3000])
		}
		return pairs
	}

	private ipToInt(ip: string): number {
		const [a, b, c, d] = ip.split('.').map(Number)
		return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0
	}

	private intToIp(n: number): string {
		return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
	}

	/** This machine's own address on every local, non-internal IPv4 interface, in the order Node.js reports
	 * them (used as a best-effort "current network first" ordering - see scanNetworkForDevices()). */
	private getLocalInterfaceAddresses(): string[] {
		const interfaces = os.networkInterfaces()
		const addresses: string[] = []
		for (const ifaceList of Object.values(interfaces)) {
			for (const iface of ifaceList ?? []) {
				if (iface.family !== 'IPv4' || iface.internal) continue
				if (!addresses.includes(iface.address)) addresses.push(iface.address)
			}
		}
		return addresses
	}

	/**
	 * Connect to an AWJ device
	 * @param addr the complete base url of the device to connect to, can contain protocol, credentials, host and port
	 * @returns void
	 */
	async connect(addr: string | undefined): Promise<void> {
		this.addr = addr
		if (this.addr === undefined) return
		this.shouldBeConnected = true

		if (this.addr.trim() === '') {
			// No address configured at all - nothing to connect to, but still worth triggering the same
			// network-scan fallback as a real connection failure, so "Found AWJ Devices" gets a chance to
			// populate even before the user has typed anything in "Device Network Address".
			this.instance.updateStatus(InstanceStatus.BadConfig, 'No device address configured')
			this.triggerNetworkScanIfNeeded()
			return
		}

		const urlObj = this.getURLobj(this.addr)
		if (urlObj === null) return

		this.instance.updateStatus(InstanceStatus.Connecting, `Init Connection`)

		try {
			// retry: 0 overrides fetchDefaultParameters' own retry: 2 specifically for this initial reachability
			// check - our own retry countdown (scheduleRetryWithCountdown) already handles retries visibly, so
			// ky retrying silently underneath would just add an unpredictable, invisible delay before the first
			// status update ever appears.
			const authResponse = await ky.get(`${urlObj.protocol()}://${urlObj.host()}/auth/status`, {
				...fetchDefaultParameters,
				retry: 0,
			}).json<{[name: string]: any}>()
			const isAuth = authResponse.authentication?.isAuthenticationEnabled
			const deviceObj = authResponse.device || authResponse.devices?.leader || undefined
			if (isAuth !== undefined && deviceObj !== undefined) {
				// it seems we are speaking to an AWJ device

				const handleApiStateResponse = async (res: {[name: string]: any}): Promise<void> => {
					if (res.device) {
						this.instance.state.set('DEVICE', res)
						// A Follower can be configured/detected (present in .followers) while the link itself is
						// currently deactivated (e.g. temporarily unplugged/standalone) - isLinkActive, from the
						// same auth/status response's separate .system object, is the actual live signal for
						// whether the system is really operating as linked right now.
						this.instance.state.set('LINK', {
							...(authResponse.device || authResponse.devices),
							isLinkActive: authResponse.system?.isLinkActive === true,
						})

						const system = res.device.system // this.instance.state.get('DEVICE/device/system')
						if (!system) {
							this.instance.updateStatus(InstanceStatus.ConnectionFailure)
							this.instance.log('error', 'Probably connected to an Analog Way device but device type is not compatible with this module')
							return
						}

						let deviceroot = system.deviceList?.items?.['1']?.pp
						if (!deviceroot) deviceroot = system.pp
						if (!deviceroot) {
							this.instance.updateStatus(InstanceStatus.ConnectionFailure)
							this.instance.log('error', 'Quite probably connected to an Analog Way device but device type is not compatible with this module')
							return
						}

						const device = deviceroot.dev
						if (!device) {
							this.instance.updateStatus(InstanceStatus.ConnectionFailure)
							this.instance.log('error', 'Connected to an Analog Way device but device type is not compatible with this module')
							return
						}

						const fwVersion = system.version?.pp?.updater ?? system.deviceList?.items?.['1']?.version?.pp?.updater ?? '0.0.0' // this.state.get('DEVICE/device/system/version/pp/updater') ?? this.state.get('DEVICE/device/system/deviceList/items/1/version/pp/updater') ?? '0.0.0'

						const serialAndFirmware = (): string => {
							const sn:string = system.serial?.pp?.serialNumber ?? system.deviceList?.items?.['1']?.serial?.pp?.serialNumber ?? 'unknown'
							if (sn.startsWith('ZZ9') || deviceroot.isSimulated) return ` Simulator, fw ${fwVersion}`
							else return `, S/N: ${sn}, fw ${fwVersion}`
						}


						let newPlatform = ''
						let modelName = ''
						if (device.substring(0, 3) === 'NLC') {
							modelName = formatAquilonModel(device)
							const major = parseInt(fwVersion.split('.')[0])
							// Firmware below V4 is no longer supported at all (the dedicated pre-V4 implementation
							// was removed - see FIRMWARE_TOO_OLD_TEXT in config.ts for why) - refuse the connection
							// outright instead of silently falling back to some other platform.
							if (isNaN(major) || major < 4) {
								this.instance.updateStatus(InstanceStatus.ConnectionFailure, `Firmware ${fwVersion} too old (below V4) - not supported`)
								this.instance.log(
									'error',
									`Connected to ${modelName}${serialAndFirmware()}. ${FIRMWARE_TOO_OLD_TEXT}`
								)
								// Persist model/firmware even on this refused connection - GetConfigFields() reads
								// config.deviceFirmware to show the "Not Supported" notice above Device Network
								// Address (see updateSuggestedField() in config.ts), which otherwise would never
								// appear at all: the normal place this gets saved (further below, after setDevice())
								// is never reached here since we return before it.
								let configChanged = false
								if (this.instance.config.deviceModel !== modelName) {
									this.instance.config.deviceModel = modelName
									configChanged = true
								}
								if (this.instance.config.deviceFirmware !== fwVersion) {
									this.instance.config.deviceFirmware = fwVersion
									configChanged = true
								}
								if (configChanged) this.instance.saveConfig(this.instance.config)
								// Fall back to the generic (platform-unknown) action/feedback/preset/variable set -
								// otherwise a previous successful connection's full LivePremier4-specific set (or a
								// stale one from before this device's firmware got downgraded) would keep being
								// shown even though it no longer applies to anything reachable now.
								try {
									this.instance.setDevice('awjdevice')
									this.instance.resetVariablesToBase()
									await this.instance.updateInstance()
								} catch (error: any) {
									this.instance.log('error', `resetting to generic device set after firmware-too-old failure failed:\n${error}`)
								}
								return
							}
							this.instance.updateStatus(InstanceStatus.Ok)
							this.instance.log(
								'info',
								'Connected to ' +
								modelName + serialAndFirmware()
							)
							newPlatform = `livepremier4`
						} else if (device.match(/^EIKOS/)) {
							modelName = 'Eikos 4k'
							this.instance.updateStatus(InstanceStatus.Ok)
							this.instance.log(
								'info',
								'Connected to ' + modelName + serialAndFirmware()
							)
							newPlatform = 'midra'
						} else if (device.match(/^PULSE/)) {
							modelName = 'Pulse 4k'
							this.instance.updateStatus(InstanceStatus.Ok)
							this.instance.log(
								'info',
								'Connected to ' + modelName + serialAndFirmware()
							)
							newPlatform = 'midra'
						} else if (device.match(/^QMX/)) {
							modelName = 'QuikMatrix 4k'
							this.instance.updateStatus(InstanceStatus.Ok)
							this.instance.log(
								'info',
								'Connected to ' + modelName + serialAndFirmware()
							)
							newPlatform = 'midra'
						} else if (device.match(/^QVU/)) {
							modelName = 'QuickVu 4k'
							this.instance.updateStatus(InstanceStatus.Ok)
							this.instance.log(
								'info',
								'Connected to ' + modelName + serialAndFirmware()
							)
							newPlatform = 'midra'
						} else if (device.match(/^ZEN100/)) {
							modelName = 'Zenith 100'
							this.instance.updateStatus(InstanceStatus.Ok)
							this.instance.log(
								'info',
								'Connected to ' + modelName + serialAndFirmware()
							)
							newPlatform = 'midra'
						} else if (device.match(/^ZEN200/)) {
							modelName = 'Zenith 200'
							this.instance.updateStatus(InstanceStatus.Ok)
							this.instance.log(
								'info',
								'Connected to ' + modelName + serialAndFirmware()
							)
							newPlatform = 'midra'
						} else if (device.match(/^DBG/)) {
							modelName = 'MNG_DEBUG'
							this.instance.updateStatus(InstanceStatus.Ok)
							this.instance.log(
								'info',
								'Connected to ' + modelName + serialAndFirmware()
							)
							newPlatform = 'midra'
						} else {
							this.instance.updateStatus(InstanceStatus.ConnectionFailure)
							this.instance.log('error', `Connected to an AWJ device of type '${device}', firmware '${fwVersion}'. Device type or firmware can not be determined or is not compatible with this module`)
							return
						}

						this.instance.state.set('LOCAL/deviceModel', modelName)
						this.instance.state.set('LOCAL/deviceSeries', newPlatform === 'midra' ? 'Midra 4K' : 'LivePremier')
						this.instance.state.set('LOCAL/deviceFirmwareVersion', fwVersion)
						const fwMajor = parseInt(fwVersion.split('.')[0])
						this.instance.state.set('LOCAL/deviceFirmwareGeneration', isNaN(fwMajor) ? '' : `V${fwMajor}`)

						try {
							this.instance.setDevice(newPlatform)
						} catch (error: any) {
							this.instance.log('error', `setting device platform to ${newPlatform} failed:\n${error}`)
						}
						try {
							this.instance.subscriptions.initSubscriptions()
						} catch (error: any) {
							this.instance.log('error', `setting up subscriptions for device failed:\n${error.stack}`)
						}
						// setDevice() may have swapped in fresh actions/feedbacks/choices instances (platform change,
						// or fresh connect) - always republish definitions here instead of relying on some subscription
						// happening to signal an update during initSubscriptions(), which is not guaranteed.
						try {
							await this.instance.updateInstance()
						} catch (error: any) {
							this.instance.log('error', `updating instance after connect failed:\n${error}`)
						}


						try {
							if (this.instance.config.sync === true && this.hadError === false) {
								console.log('switching sync on because of config')
								this.instance.switchSync(1)
							} else if (this.hadError === true) {
								this.instance.switchSync(3)
								console.log('setting sync again after reconnection')
							} else {
								this.instance.switchSync(0)
								console.log('setting sync off by default')
							}
						} catch (error: any) {
							this.instance.log('error', `switching sync after connect failed:\n${error}`)
						}
						this.hadError = false
						this.hasScannedSinceLastFailure = false
						

						try {
							const deviceMacaddr = this.instance.choices.getMACaddress()
							const configMacaddr = this.instance.config.macaddress.split(/[,:_.\s-]/).join(':')
							let configChanged = false
							if (configMacaddr !== deviceMacaddr) {
								this.instance.config.macaddress = deviceMacaddr
								configChanged = true
							}
							if (this.instance.config.deviceModel !== modelName) {
								this.instance.config.deviceModel = modelName
								configChanged = true
							}
							if (this.instance.config.deviceFirmware !== fwVersion) {
								this.instance.config.deviceFirmware = fwVersion
								configChanged = true
							}
							// Kept fully in sync with live reality in both directions - e.g. after picking a
							// simulator found via the network-scan dropdown, the checkbox should reflect that
							// without a separate manual step, and equally should clear itself if pointed at a
							// real device while still checked from a previous simulator connection.
							if (this.instance.config.simulatedDevice !== deviceroot.isSimulated) {
								this.instance.config.simulatedDevice = !!deviceroot.isSimulated
								configChanged = true
							}
							// A simulator's https is selectable but doesn't work and has no upside (confirmed
							// live) - force Secure HTTP off whenever a live check confirms this IS a simulator,
							// regardless of whether the checkbox itself was already checked (a user could have
							// typed https:// by hand while assuming it would work here).
							if (deviceroot.isSimulated && this.instance.config.secureHttp) {
								this.instance.config.secureHttp = false
								configChanged = true
							}

							// Linked systems (e.g. Aquilon) can have up to 3 additional Follower devices - detect
							// and store their IP/MAC/Model/Firmware too, so Wake on LAN can also wake them (see
							// devicePower). Blank means "no link detected" and is shown as such in the config UI.
							for (const deviceKey of [2, 3, 4] as const) {
								const {ip, mac, model, firmware} = this.instance.choices.getLinkedDeviceInfo(deviceKey)
								const ipField = `device${deviceKey}ip` as const
								const macField = `device${deviceKey}mac` as const
								const modelField = `device${deviceKey}model` as const
								const firmwareField = `device${deviceKey}firmware` as const
								if (this.instance.config[ipField] !== ip) {
									this.instance.config[ipField] = ip
									configChanged = true
								}
								if (this.instance.config[macField] !== mac) {
									this.instance.config[macField] = mac
									configChanged = true
								}
								if (this.instance.config[modelField] !== model) {
									this.instance.config[modelField] = model
									configChanged = true
								}
								if (this.instance.config[firmwareField] !== firmware) {
									this.instance.config[firmwareField] = firmware
									configChanged = true
								}
							}

							// Card/slot info (used for the config's installed-cards display) lives on a separate
							// REST endpoint, /api/device/chassis/{deviceKey} - not part of the WebSocket-pushed
							// DEVICE state tree at all, confirmed live (2026-09-05) via the real WebRCS UI's own
							// "Hardware" panel network call. Only fetched for deviceKey 1 (Leader) and any
							// deviceKey 2-4 that's actually linked right now. Must complete BEFORE saveConfig()
							// below - Companion only re-renders the open config panel in response to a config
							// change, so if this ran after saveConfig() the freshly-fetched cards would sit in
							// state but never actually get shown until some later, unrelated config change.
							const deviceKeysToFetch = [1, ...([2, 3, 4] as const).filter((deviceKey) => !!this.instance.config[`device${deviceKey}ip` as const])]
							await Promise.all(deviceKeysToFetch.map(async (deviceKey) => {
								const chassis = await this.fetchChassisInfo(deviceKey)
								this.instance.state.set(['LOCAL', 'chassis', deviceKey.toString()], chassis)
								const slotCount = Array.isArray(chassis?.slots) ? chassis.slots.length : 'n/a'
								this.instance.log('warn', `chassis info for device ${deviceKey}: ${chassis === null ? 'FAILED (null - see any error above)' : `OK, ${slotCount} slots`}`)
							}))
							// The chassis fetch itself never changes anything under this.instance.config, but its
							// result must reach the UI - force the same saveConfig() refresh path unconditionally.
							configChanged = true

							if (configChanged) this.instance.saveConfig(this.instance.config)
						} catch (error) {
							this.instance.log('error', 'getting MAC address/chassis info from device failed ' + error)
						}

						// The REMOTE channel (current selection, global anchor point) only ever streams deltas over
						// the websocket - unlike DEVICE, there is no REST snapshot for it. If nothing about the
						// selection actually changes right after a (re)connect, these variables stay blank until
						// the user makes a new selection, since our subscriptions only ever saw them go from
						// "unset" to "unset". Re-running these once more after the websocket's initial burst had
						// time to land catches up on whatever was already selected before the (re)connect.
						setTimeout(() => {
							try {
								this.instance.subscriptions.initSubscriptions('selectedLayerSelectionChange')
								this.instance.subscriptions.initSubscriptions('globalAnchorPointChange')
								this.instance.subscriptions.initSubscriptions('selectedScreenChange')
							} catch (error: any) {
								this.instance.log('error', `refreshing selection-derived variables after connect failed:\n${error}`)
							}
						}, 1500)

						return
						
					} else {
						this.instance.log('error', 'Got malformed state from device ' + res)
					}
					return
				}

				const setupDevice = async () => {
					// A previous websocket instance (e.g. from an earlier attempt during a reconnect storm,
					// with reconnects starting as fast as every 100ms) might still be open/connecting here -
					// overwriting the reference without closing it first leaks the underlying OS socket and
					// its listeners on every single reconnect attempt. Over an extended outage (reconnects
					// keep happening until the max interval, dozens of attempts for a multi-minute outage)
					// this can exhaust the OS's socket buffer ("no buffer space available"). Remove its
					// listeners first so its own close handler can't itself trigger another reconnect, then
					// force-terminate it (not the graceful .close(), which could itself hang against an
					// already-unreachable device) before creating the new one.
					if (this.websocket) {
						this.websocket.removeAllListeners()
						this.websocket.terminate()
					}

					const webSocketProtocol = urlObj.protocol() === 'https' ? 'wss://' : 'ws://'
					this.websocket = new WebSocket(`${webSocketProtocol}${urlObj.host()}`, { handshakeTimeout: 1234, maxRedirects: 1 })

					this.websocket.on('open', async () => {
						this.reconnectinterval = this.reconnectmin
						this.instance.log('debug', 'Websocket opened')

						this.heartbeatMissed = 0
						if (this.heartbeatInterval) clearInterval(this.heartbeatInterval)
						this.heartbeatInterval = setInterval(() => {
							if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) return
							if (this.heartbeatMissed >= this.heartbeatMaxMissed) {
								this.instance.log('warn', 'No response to WebSocket ping (connection likely went stale, e.g. after system sleep/standby) - forcing reconnect')
								this.websocket.terminate()
								return
							}
							this.heartbeatMissed += 1
							this.websocket.ping()
						}, this.heartbeatIntervalMs)
					})

					this.websocket.on('pong', () => {
						this.heartbeatMissed = 0
					})

					this.websocket.on('close', () => {
						if (this.heartbeatInterval) {
							clearInterval(this.heartbeatInterval)
							this.heartbeatInterval = undefined
						}
						if (this.shouldBeConnected) {
							this.hadError = true
							this.scheduleRetryWithCountdown(
								InstanceStatus.Disconnected,
								(secondsLeft) => `Disconnected, retrying in ${secondsLeft}s`
							)
							this.triggerNetworkScanIfNeeded()
						}
					})

					this.websocket.on('error', (error) => {
						this.hadError = true
						console.log('websocket error', error.toString())
						this.instance.updateStatus(InstanceStatus.ConnectionFailure)
						if (error.toString().match(/Error: Opening handshake has timed out/)) {
							this.instance.log(
								'error',
								'Connection attempt to device has timed out, will retry in ' + Math.round(this.reconnectinterval/100)/10 + 's'
							)
						}
						else if (error.toString().match(/Error: self signed certificate/)) {
							this.instance.log(
								'error',
								'Device is presenting a self signed certificate and is considered insecure. No more automatic connection retries.'
							)
							this.shouldBeConnected = false
						} else {
							this.instance.log('error', 'Socket ' + error)
						}
					})

					this.websocket.on('message', (data, isBinary) => {
						if (isBinary != true) {
							this.instance.state.apply(JSON.parse(data.toString()))
						}
					})

					const download = await this.downloadDevicestate(urlObj)

					await handleApiStateResponse(download)

				}

				if (authResponse?.authentication.isAuthenticationEnabled === true) {
					// Password required
					this.instance.updateStatus(InstanceStatus.Connecting, `Logging in`)
					try {
						// 'manual' instead of 'error': newer firmware (v4+) responds to a successful login with a
						// redirect instead of a plain 200, so we must not treat a redirect as a hard failure - we
						// inspect the (possibly 3xx) response ourselves for the auth cookie instead of following it.
						// throwHttpErrors: false so ky returns the 302 response instead of throwing before we get
						// a chance to look at it.
						let res = await ky(`${urlObj.protocol()}://${urlObj.host()}/auth/login`, {
							method: 'post',
							json: { password: urlObj.password() },
							retry: 2,
							redirect: 'manual',
							throwHttpErrors: false
						})
						// Got successful auth response
						// Note: res.headers is a Headers instance (fetch API), not a plain object - must use .get(), bracket access always returns undefined
						const setCookie = res.headers.get('set-cookie')
						if (setCookie) {
							this.authcookie = setCookie
							this.instance.log('info', 'Login to device is successful')

							await setupDevice()

						} else {
							this.instance.updateStatus(InstanceStatus.AuthenticationFailure, 'This device is password protected. Please enter the correct credentials in the device address.')
							this.instance.log('error', 'Login to device failed: no session cookie received. Check username/password in the device address.')
						}

					} catch (error) {
						// Note: do not re-reject here - nothing awaits/catches connect()'s callers, so a rejection
						// here would become an unhandled promise rejection and crash the whole module process.
						this.instance.updateStatus(InstanceStatus.AuthenticationFailure, 'This device is password protected. Please enter the correct credentials in the device address.')
						this.instance.log('error', 'Password failed ' + error)
					}

				} else {
					// no Password required
					await setupDevice()
				}
			} else {
				this.instance.updateStatus(InstanceStatus.ConnectionFailure, 'No AWJ device')
				this.instance.log('error', 'Connected to a device, but it is no compatible AWJ device, disconnecting now.')
				this.disconnect()
			}

		} catch (error) {
			this.disconnect()
			let logMessage: string
			let buildMessage: (secondsLeft: number) => string
			if (String(error).match(/fetch failed/)) {
				buildMessage = (secondsLeft) => `Device unreachable, retrying in ${secondsLeft}s`
				logMessage = `Can't connect to device, probably offline. Will retry in ${Math.ceil(this.reconnectinterval / 1000)}s`
			} else if (String(error).match(/terminated/)) {
				buildMessage = (secondsLeft) => `Connection terminated, retrying in ${secondsLeft}s`
				logMessage = `Connection to device has been terminated unexpectedly. Will retry in ${Math.ceil(this.reconnectinterval / 1000)}s`
			} else {
				buildMessage = (secondsLeft) => `Connection failed, retrying in ${secondsLeft}s`
				logMessage = `Can't connect to device webserver. ${error}\nWill retry in ${Math.ceil(this.reconnectinterval / 1000)}s`
			}
			this.instance.log('error', logMessage)
			this.scheduleRetryWithCountdown(InstanceStatus.ConnectionFailure, buildMessage)
			this.triggerNetworkScanIfNeeded()
		}
	}

	/**
	 * One-shot automatic fallback: the configured address isn't answering, so sweep the local network(s) for
	 * anything that looks like an AWJ device (see scanNetworkForDevices()) and offer whatever turns up in the
	 * "Found AWJ Devices" config dropdown. Called both when a fresh connect() attempt fails outright and
	 * immediately when an already-established connection unexpectedly drops (the websocket 'close' handler) -
	 * not just on the next retry's connect() failure, so the scan starts right away instead of only after the
	 * next ~10s retry interval elapses. Deliberately not awaited by callers - runs in the background, and
	 * only once per disconnected episode (hasScannedSinceLastFailure resets on the next successful connect).
	 */
	private triggerNetworkScanIfNeeded(): void {
		if (this.hasScannedSinceLastFailure || this.isScanningNetwork) return
		this.hasScannedSinceLastFailure = true
		this.isScanningNetwork = true
		this.scanNetworkForDevices()
			.then((found) => {
				this.instance.state.set(['LOCAL', 'networkScanResults'], found)
				this.instance.log('warn', found.length > 0
					? `Network scan found ${found.length} AWJ device(s) - see "Found AWJ Devices" in the connection's config.`
					: 'Network scan for AWJ devices found nothing.')
				// Nothing in this.instance.config actually changed, but the config panel (if open) only
				// re-renders in response to a config change - force that refresh so the new dropdown
				// choices actually show up, same fix as the "Installed Cards" field needed.
				this.instance.saveConfig(this.instance.config)
			})
			.catch((error) => this.instance.log('error', 'Network scan for AWJ devices failed: ' + error))
			.finally(() => { this.isScanningNetwork = false })
	}

	async downloadDevicestate(urlObj: URI) {
		let downloaded = 0
		this.instance.updateStatus(InstanceStatus.Connecting, `Syncing`)
		let response: any
		try {
			response = await ky.get(`${urlObj.protocol()}://${urlObj.host()}/api/stores/device`,{
				headers: {
					cookie: this.authcookie
				},
				...fetchDefaultParameters,
				onDownloadProgress: (progress, _chunk) => {
					const newDownloaded = Math.floor(progress.transferredBytes / 1024000)
					if (newDownloaded !== downloaded) {
						downloaded = newDownloaded
						this.instance.updateStatus(InstanceStatus.Connecting, `Syncing ${downloaded.toString().padStart(3,'0')}MB`)
					}
				}
			}).json<any>()
			return response
		} catch (err) {
			this.instance.updateStatus(InstanceStatus.ConnectionFailure)
			this.instance.log('error', "Can't retrieve state from device " + err)
			return Promise.reject(err)
		}
	}

	resetReconnectInterval(): void {
		this.reconnectinterval = this.reconnectmin
	}

	restPOST(href: string, message: string): void {
		const urlObj = this.getURLobj(href)
		if (urlObj === null) return

		const postData = (cookie: string): Promise<void> =>
			ky.post(`${urlObj.protocol()}://${urlObj.host()}${urlObj.resource()}`, {
				body: message,
				headers: {
					'Content-Type': 'application/json',
					...(cookie ? { 'Cookie': cookie } : {}),
				},
				...fetchDefaultParameters,
				redirect: 'error',
			})
				.then((res) => {
					this.instance.log('debug', 'http POST successful ' + res.status)
				})
				.catch((err) => {
					this.instance.log('debug', 'http POST failed ' + err)
				})

		if (this.authcookie.length > 0) {
			postData(this.authcookie)
		} else if (urlObj.username() !== 'Admin') {
			postData('')
		} else {
			// URL carries "Admin" credentials but no session cookie yet - log in first, then POST regardless
			// of whether the login actually returned a cookie (a failed login still surfaces as a failed POST
			// via the device's own auth rejection, same as before this was factored out).
			ky.post(`${urlObj.protocol()}://${urlObj.host()}/auth/login`, {
				body: JSON.stringify({ password: urlObj.password() }),
				headers: {
					'Content-Type': 'application/json',
				},
				...fetchDefaultParameters,
				redirect: 'manual',
				throwHttpErrors: false,
			})
				.then((res) => {
					// res.headers is a Headers instance (fetch API), not a plain object - must use .get()
					const setCookie = res.headers.get('set-cookie')
					if (setCookie) {
						this.authcookie = setCookie
						this.instance.log('info', 'Login to device is successful')
					}
					return postData(this.authcookie)
				})
				.catch((err) => {
					this.instance.log('debug', 'http POST failed ' + err)
				})
		}
	}

	/** Serializes every getSnapshot() call device-wide to at most 1/second (see getSnapshot). Necessary because
	 *  our own per-item polling throttle (deviceThumbnail feedback) is not the only caller: Companion has been
	 *  observed to invoke an 'advanced' feedback's callback once to render a preview thumbnail in the preset
	 *  browser panel too - unlike 'boolean' feedbacks (which have a static defaultStyle to fall back on for a
	 *  preview, no callback needed), 'advanced' feedbacks have no such fallback, so Companion has no way to know
	 *  what to show without actually running the callback. With e.g. ~190 Still Image Library presets, that
	 *  meant ~190 requests firing at once the first time the preset panel was opened, overwhelming the device
	 *  and causing some thumbnails to silently fail to load. This queue makes that impossible structurally,
	 *  regardless of how many places in Companion end up calling getSnapshot concurrently. */
	private snapshotQueue: Array<() => Promise<void>> = []
	private snapshotQueueRunning = false
	// TEST value (2026-08-21, was 1000/1-per-second): a burst of ~190 preset-preview-triggered requests (see
	// comment above) backed up behind the 1-per-second pace badly enough that real, already-placed buttons'
	// own thumbnails stalled for minutes waiting their turn in the same queue. 10/second is still each request
	// fully finishing before the next one starts (see the `await job()` below - never actually concurrent, just
	// paced), so it does not reintroduce the original "everything fires at once" overload; only needs to prove
	// out this rate doesn't overwhelm the device the way truly-simultaneous requests did.
	private readonly snapshotMinIntervalMs = 100

	private runSnapshotQueue(): void {
		if (this.snapshotQueueRunning) return
		this.snapshotQueueRunning = true
		const step = async () => {
			const job = this.snapshotQueue.shift()
			if (!job) {
				this.snapshotQueueRunning = false
				return
			}
			await job()
			setTimeout(step, this.snapshotMinIntervalMs)
		}
		step()
	}

	/**
	 * Fetches the physical chassis/card layout for one device (1 = Leader, 2-4 = a linked Follower), from
	 * `http://<address>/api/device/chassis/{deviceKey}` - confirmed live (2026-09-05) as the same call the
	 * real WebRCS "Device Overview - Hardware" panel makes. Returns the raw parsed JSON (a `slots` array,
	 * each slot carrying `attributes.cardKey`/`cardType`/`febeCardType` and an `elements` array of `PLUGS`
	 * entries whose `plugTypes` give the real per-port connector types - port COUNT is not a plain number
	 * anywhere, it has to be derived from counting non-empty `plugTypes` entries), or null if unreachable.
	 */
	async fetchChassisInfo(deviceKey: number): Promise<any | null> {
		if (!this.addr) return null
		const urlObj = this.getURLobj(this.addr)
		if (urlObj === null) return null
		try {
			return await ky.get(`${urlObj.protocol()}://${urlObj.host()}/api/device/chassis/${deviceKey}`, {
				headers: this.authcookie ? { cookie: this.authcookie } : {},
				retry: 0,
				timeout: 5000,
			}).json()
		} catch {
			return null
		}
	}

	/**
	 * Fetches one live snapshot (thumbnail) from the device's REST API, documented as
	 * `http://<address>/api/device/snapshots/{category}/{n}` (n is 1-based, PNG, up to 256x256, category is
	 * one of inputs/outputs/images/timers/multiviewers). The device limits snapshot requests to 1/second per
	 * item - queued (see snapshotQueue above) to guarantee that device-wide, not just per item.
	 * @returns base64-encoded PNG data, or null if unreachable/not connected/request failed
	 */
	async getSnapshot(category: 'inputs' | 'outputs' | 'images' | 'timers' | 'multiviewers', id: number | string): Promise<string | null> {
		return new Promise<string | null>((resolve) => {
			this.snapshotQueue.push(async () => {
				if (!this.addr || this.websocket?.readyState !== 1) {
					resolve(null)
					return
				}
				const urlObj = this.getURLobj(this.addr)
				if (urlObj === null) {
					resolve(null)
					return
				}
				try {
					const buffer = await ky.get(`${urlObj.protocol()}://${urlObj.host()}/api/device/snapshots/${category}/${id}`, {
						headers: this.authcookie ? { cookie: this.authcookie } : {},
						retry: 0,
						timeout: 5000,
					}).arrayBuffer()
					resolve(Buffer.from(buffer).toString('base64'))
				} catch {
					resolve(null)
				}
			})
			this.runSnapshotQueue()
		})
	}

	disconnect(): void {
		clearTimeout(this.wsTimeout)
		if (this.countdownTimer) clearInterval(this.countdownTimer)
		this.shouldBeConnected = false
		this.hadError = false
		this.websocket?.close()
		this.buffer = ''
	}

	destroy(): void {
		this.disconnect()
		this.websocket = null
		this.authcookie = ''
		this.instance.log('debug', 'Connection has been destroyed due to removal or disable by user')
	}

	/**
	 * Sends a raw text message to the device via websocket connection
	 * @param message the message string to send
	 */
	sendRawWSmessage(message: string): void {
		if (this.websocket?.readyState === 1) {
			this.websocket?.send(message)
			// this.instance.log('debug', 'sending WS message ' + this.websocket.url + ' ' + message)
		}
	}

	/**
	 * Sends an AW message to the device via websocket
	 * @param path a path in the device object, can be a string with slashes as delimiters or an array of strings. The path will be mapped according to mappings.
	 * @param values the values to send
	 */
	sendWSmessage(
		path: string | string[],
		...values: (string | string[] | number | boolean)[]
	): void {
		
		for (const value of values) {
			const obj = {
				channel: 'DEVICE',
				data: {
					path,
					value
				}
			}
			this.sendRawWSmessage(JSON.stringify(obj))
		}
	}

	/**
	 * Mirrors a command to the Hot Backup Device, in the exact same shape sendWSmessage() just sent to the
	 * main device - called from the currently curated set of "safe" actions (Recall Screen/Master/Layer
	 * Memory, Screen Selection - deliberately starting narrow, to be expanded once this is confirmed working
	 * against real hardware) right after their own sendWSmessage() call. Fire-and-forget, one-way only - the
	 * backup device's response is never read (see backupConnection.ts). A no-op whenever Hot Backup isn't
	 * enabled, or its connection isn't currently open (no queueing - a command missed while the backup device
	 * was unreachable is simply not mirrored, matching this feature's "best-effort, not guaranteed redundancy"
	 * design, see the "Enable Hot Backup Device" tooltip).
	 */
	mirrorToBackup(path: string | string[], ...values: (string | string[] | number | boolean)[]): void {
		if (!this.instance.config.hotBackupEnabled) return
		this.backupConnection.send(path, ...values)
	}

	/**
	 * Force-unlocks a screen/aux on the Hot Backup Device, unconditionally - called right before mirroring a
	 * Recall Screen/Master/Layer Memory to it, regardless of whether the corresponding screen is actually
	 * locked on Main. Nobody operates the Backup device directly (see the "Enable Hot Backup Device" tooltip),
	 * so there is no legitimate "should stay locked" case to preserve there - only the risk of a mirrored
	 * recall being silently rejected by a lock state this one-way connection has no way to even see.
	 */
	mirrorUnlockToBackup(screen: string, preset: string): void {
		if (!this.instance.config.hotBackupEnabled) return
		const platformLongId = this.instance.choices.getScreenInfo(screen).platformLongId
		const pst = preset === 'PREVIEW' ? 'Prw' : 'Pgm'
		this.backupConnection.sendData('REMOTE', 'unlockScreenAuxes' + pst, '/live/screens/presetModeLock', [[platformLongId]])
	}

	/**
	 * Replaces the Hot Backup Device's own selection with `screens` (platform long ids), via the same REMOTE
	 * 'replace' shape the main "Screen Selection" action uses - called whenever Main's own selection changes,
	 * regardless of whether Main itself is in "sync selection" (REMOTE) or local-only mode, since Backup has
	 * no local-selection concept of its own to update - REMOTE is the only lever that affects what a WebRCS
	 * client connected to Backup would show as selected.
	 */
	mirrorSelectionToBackup(screens: string[]): void {
		if (!this.instance.config.hotBackupEnabled) return
		const platformLongIds = screens.map((screen) => this.instance.choices.getScreenInfo(screen).platformLongId)
		this.backupConnection.sendData('REMOTE', 'replace', '/live/screens/screenAuxSelection', [platformLongIds])
	}

	/**
	 * Sends a patch via websocket
	 * @param channel
	 * @param op
	 * @param path the path in the channel object. Path will be mapped according to mappings.
	 * @param value
	 */
	sendWSpatch(channel: string, op: string, path: string | string[], value: string | number | boolean | object): void {
	
		const obj = {
			channel,
			data: {
				channel: 'PATCH',
				patch: {
					op: op,
					path,
					value
				}
			}
		}
		this.sendRawWSmessage(JSON.stringify(obj))
	}

	/**
	 * Sends a patch via websocket
	 * @param channel
	 * @param op
	 * @param path the path in the channel object. Path will be mapped according to mappings.
	 * @param value
	 */
	sendWSdata(channel: string, name: string, path: string | string[], args: unknown[]): void {
		let obj = {}
		
		if (args.length === 0) {
			obj = {
				channel,
				data: {
					name,
					path,
					args: []
				}
			}
		} else {
			obj = {
				channel,
				data: {
					name,
					path,
					args
				}
			}	
		}
		this.sendRawWSmessage(JSON.stringify(obj))
	}

	/**
	 * createMagicPacket
	 */
	createMagicPacket(mac: string): Buffer {
		const MAC_REPEAT = 16
		const MAC_LENGTH = 0x06
		const PACKET_HEADER = 0x06
		const parts = mac.match(/[0-9a-fA-F]{2}/g)
		if (!parts || parts.length != MAC_LENGTH) throw new Error(`malformed MAC address "${mac}"`)
		let buffer = Buffer.alloc(PACKET_HEADER)
		const bufMac = Buffer.from(parts.map((p) => parseInt(p, 16)))
		buffer.fill(0xff)
		for (let i = 0; i < MAC_REPEAT; i++) {
			buffer = Buffer.concat([buffer, bufMac])
		}
		return buffer
	}
	/**
	 * wake on lan
	 */
	wake(mac: string): void {
		// create magic packet
		const magicPacket = this.createMagicPacket(mac)
		const socket = dgram.createSocket("udp4")
		// A dgram Socket is a Node EventEmitter - an unhandled 'error' event (e.g. a bind failure or an
		// unreachable broadcast route) throws and crashes the whole module process by default, not just this
		// one wake-on-LAN call, so this needs its own handler regardless of how unlikely the error is.
		socket.on('error', (err) => {
			this.instance.log('error', 'Could not send wake on lan packet. ' + err)
			socket.close()
		})
		socket.bind(() => {
			socket.setBroadcast(true)
			socket.send(magicPacket, 9, '255.255.255.255', (err) => {
					if (err) {
						this.instance.log('error', 'Could not send wake on lan packet. '+ err)
					}
					else this.instance.log('info', 'wake on lan packet sent')
					socket.close()
				})
		})
	}
}

export { AWJconnection }
