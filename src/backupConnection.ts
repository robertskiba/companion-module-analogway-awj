import ky from 'ky'
import URI from 'urijs'
import WebSocket from 'ws'
import { AWJinstance } from './index.js'

/**
 * Lightweight, send-only WebSocket connection to the Hot Backup Device - deliberately much simpler than the
 * main AWJconnection (connection.ts): no full state download, no platform detection, no subscriptions, no
 * chassis fetch, no sync-selection handling. It only ever needs to open a websocket and forward the exact same
 * curated "safe" recall/transition commands the main device just received (see AWJconnection.mirrorToBackup()/
 * mirrorDataToBackup() and their call sites in the Recall Screen/Master/Aux/Multiviewer Memory and Take/Cut
 * action callbacks), fire-and-forget - any response from the backup device is read and discarded, this
 * connection is one-way only by design (see the "Enable Hot Backup Device" config option's own tooltip for the
 * full list of caveats the operator is responsible for).
 */
class AWJBackupConnection {
	private instance: AWJinstance
	private websocket: WebSocket | undefined
	private authcookie = ''
	private addr: string | undefined
	private shouldBeConnected = false
	private reconnectTimeout: ReturnType<typeof setTimeout> | undefined
	// Flat 10s retry, matching AWJconnection's own reconnect pace - no need for a fancier backoff on a
	// send-only, best-effort connection like this one.
	private readonly reconnectIntervalMs = 10_000

	constructor(instance: AWJinstance) {
		this.instance = instance
	}

	/** True while the backup device's websocket is actually open - used by the "Device - Failover to Hot
	 *  Backup" action's live device-status info field, and by Device.Connected.Hotbackupdevice/the
	 *  deviceConnectionStatus feedback once this connection has a real state of its own to report (still
	 *  simulating Main's status for now, see AWJinstance.updateHotBackupVariables()). */
	get isConnected(): boolean {
		return this.websocket?.readyState === 1
	}

	private getURLobj(address: string) {
		const withProtocol = address.match(/^https?:\/\//) ? address : 'http://' + address
		const urlObj = new URI(withProtocol)
		if (urlObj.protocol() === 'http' && urlObj.port() === '') urlObj.port('80')
		if (urlObj.protocol() === 'https' && urlObj.port() === '') urlObj.port('443')
		if (urlObj.protocol() !== 'http' && urlObj.protocol() !== 'https') return null
		return urlObj
	}

	/** Starts (or restarts, if already running against a different address) the backup connection. A no-op if
	 *  already connecting/connected to this exact same address. */
	start(addr: string): void {
		if (this.shouldBeConnected && this.addr === addr) return
		this.stop()
		this.addr = addr
		this.shouldBeConnected = true
		void this.connect()
	}

	stop(): void {
		this.shouldBeConnected = false
		if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout)
		this.reconnectTimeout = undefined
		if (this.websocket) {
			this.websocket.removeAllListeners()
			this.websocket.terminate()
			this.websocket = undefined
		}
		this.authcookie = ''
		this.instance.updateHotBackupVariables()
	}

	private scheduleReconnect(): void {
		if (!this.shouldBeConnected) return
		if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout)
		this.reconnectTimeout = setTimeout(() => void this.connect(), this.reconnectIntervalMs)
	}

	private async connect(): Promise<void> {
		if (!this.addr || !this.shouldBeConnected) return
		const urlObj = this.getURLobj(this.addr)
		if (urlObj === null) {
			this.instance.log('warn', `Hot Backup Device: "${this.addr}" is not a valid address, not connecting.`)
			return
		}
		try {
			const authResponse = await ky.get(`${urlObj.protocol()}://${urlObj.host()}/auth/status`, {
				retry: 0,
				timeout: 5000,
			}).json<{ [key: string]: any }>()
			if (authResponse?.authentication?.isAuthenticationEnabled === true) {
				const res = await ky(`${urlObj.protocol()}://${urlObj.host()}/auth/login`, {
					method: 'post',
					json: { password: urlObj.password() },
					retry: 0,
					redirect: 'manual',
					throwHttpErrors: false,
				})
				const setCookie = res.headers.get('set-cookie')
				if (setCookie) {
					this.authcookie = setCookie
				} else {
					this.instance.log('warn', `Hot Backup Device (${this.addr}) is password protected and login failed - check the credentials in "Hot Backup Device Address". Retrying in 10s.`)
					this.scheduleReconnect()
					return
				}
			}
			this.openWebsocket(urlObj)
		} catch (error) {
			this.instance.log('debug', `Hot Backup Device unreachable (${this.addr}): ${error} - retrying in 10s.`)
			this.scheduleReconnect()
		}
	}

	private openWebsocket(urlObj: ReturnType<AWJBackupConnection['getURLobj']>): void {
		if (urlObj === null) return
		if (this.websocket) {
			this.websocket.removeAllListeners()
			this.websocket.terminate()
		}
		const webSocketProtocol = urlObj.protocol() === 'https' ? 'wss://' : 'ws://'
		this.websocket = new WebSocket(`${webSocketProtocol}${urlObj.host()}`, {
			handshakeTimeout: 5000,
			maxRedirects: 1,
			headers: this.authcookie ? { cookie: this.authcookie } : {},
		})

		this.websocket.on('open', () => {
			this.instance.log('info', `Hot Backup Device connected (${this.addr})`)
			this.instance.updateHotBackupVariables()
			// The Backup device could just have (re)booted (e.g. after loading a saved backup show, or simply
			// reconnecting after a network blip) - it has no memory of anything mirrored before this exact
			// connection opened, so push what we can resync immediately rather than waiting for the next live
			// action on Main. Currently only the screen selection is resyncable this way (a Memory recall is a
			// one-time trigger, not a resendable "current state" we track) - see the "Enable Hot Backup Device"
			// tooltip for this feature's other known limitations.
			this.instance.connection.mirrorSelectionToBackup(this.instance.choices.getSelectedScreens())
		})
		this.websocket.on('close', () => {
			this.instance.updateHotBackupVariables()
			if (this.shouldBeConnected) this.scheduleReconnect()
		})
		this.websocket.on('error', (error) => {
			this.instance.log('debug', `Hot Backup Device websocket error: ${error}`)
			// 'close' fires right after for the same failure - the reconnect is scheduled there.
		})
		// Responses from the backup device are deliberately ignored - this connection is send-only.
		this.websocket.on('message', () => {})
	}

	private sendRaw(message: string): void {
		if (this.websocket?.readyState === 1) this.websocket.send(message)
	}

	/** Mirrors AWJconnection.sendWSmessage()'s exact wire format - used for Recall Screen/Master/Layer Memory. */
	send(path: string | string[], ...values: (string | string[] | number | boolean)[]): void {
		for (const value of values) {
			this.sendRaw(JSON.stringify({ channel: 'DEVICE', data: { path, value } }))
		}
	}

	/** Mirrors AWJconnection.sendWSdata()'s exact wire format - used for unlocking a screen before a mirrored
	 *  recall (channel 'REMOTE', matching setScreenLock()'s own REMOTE branch) and for Screen Selection
	 *  (channel 'REMOTE', matching the main "Screen Selection" action's own REMOTE branch). */
	sendData(channel: string, name: string, path: string | string[], args: unknown[]): void {
		this.sendRaw(JSON.stringify({ channel, data: { name, path, args } }))
	}
}

export { AWJBackupConnection }
