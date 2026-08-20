import { AWJinstance } from './index.js'
import * as dgram from 'dgram'
import ky from 'ky'
import URI from 'urijs'
import WebSocket from 'ws'
import { InstanceStatus } from '@companion-module/base'

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
	private readonly reconnectmin = 100
	private readonly reconnectmax = 16_500
	private reconnectinterval = this.reconnectmin
	private readonly delimiter = '!' // '\x04'
	private readonly bufferMaxLength = 64_000
	private buffer = ''
	private shouldBeConnected: boolean
	private hadError: boolean

	constructor(instance: AWJinstance) {
		this.instance = instance
		this.hadError = false
		this.shouldBeConnected = false
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

	getURLobj(address: string) {
		if (address.match(/^https?:\/\//) == null) {
			address = 'http://' + address
		}
		const urlObj = new URI(address)
		if (urlObj.is('domain')) {
			//console.log('URL Domain', urlObj)
		} else if (urlObj.is('ipv4')) {
			//console.log('URL ipv4', urlObj)
		} else if (urlObj.is('ipv6')) {
			//console.log('URL ipv6', urlObj)
		} else {
			this.instance.log('warn', 'URL seems invalid')
		}
		if (urlObj.protocol() === 'http' && urlObj.port === null) {
			urlObj.port('80')
		}
		if (urlObj.protocol() === 'https' && urlObj.port === null) {
			urlObj.port('443')
		}
		if (urlObj.protocol() !== 'http' && urlObj.protocol() !== 'https') {
			this.instance.log('error', 'Protocol needs to be either http or https but is ' + urlObj.protocol())
			return null
		}
		return urlObj
	}

	/**
	 * Connect to a AWJ device
	 * @param addr the complete base url of the device to connect to, can contain protocol, credentials, host and port
	 * @returns void
	 */
	async connect(addr: string | undefined): Promise<void> {
		this.addr = addr
		if (this.addr === undefined) return
		this.shouldBeConnected = true

		const urlObj = this.getURLobj(this.addr)
		if (urlObj === null) return

		this.instance.updateStatus(InstanceStatus.Connecting, `Init Connection`)

		try {
			const authResponse = await ky.get(`${urlObj.protocol()}://${urlObj.host()}/auth/status`, {
				...fetchDefaultParameters,
			}).json<{[name: string]: any}>()
			// console.log('auth response', authResponse)
			const isAuth = authResponse.authentication?.isAuthenticationEnabled
			const deviceObj = authResponse.device || authResponse.devices?.leader || undefined
			if (isAuth !== undefined && deviceObj !== undefined) {
				// it seems we are speaking to an AWJ device

				const handleApiStateResponse = async (res: {[name: string]: any}): Promise<void> => {
					if (res.device) {
						this.instance.state.set('DEVICE', res)
						//console.log('rest get API device state result')
						this.instance.state.set('LINK', authResponse.device || authResponse.devices)

						const system = res.device.system // this.instance.state.get('DEVICE/device/system')
						if (!system) {
							this.instance.updateStatus(InstanceStatus.ConnectionFailure)
							this.instance.log('error', 'Probably connected to an Analog Way device but device type is not compatible with this module')
							return
						}

						let deviceroot = system.deviceList?.items['1'].pp
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
						if (device.substring(0, 3) === 'NLC') {
							this.instance.updateStatus(InstanceStatus.Ok)
							this.instance.log(
								'info',
								'Connected to ' +
								device.replace('NLC_', 'Aquilon ') + serialAndFirmware()
							)
							const major = parseInt(fwVersion.split('.')[0])
							if (!isNaN(major) && major >= 4) {
								newPlatform = `livepremier4`
							} else {
								newPlatform = 'livepremier'
							}
						} else if (device.match(/^EIKOS/)) {
							this.instance.updateStatus(InstanceStatus.Ok)
							this.instance.log(
								'info',
								'Connected to Eikos 4k' + serialAndFirmware()
							)
							newPlatform = 'midra'
						} else if (device.match(/^PULSE/)) {
							this.instance.updateStatus(InstanceStatus.Ok)
							this.instance.log(
								'info',
								'Connected to Pulse 4k' + serialAndFirmware()
							)
							newPlatform = 'midra'
						} else if (device.match(/^QMX/)) {
							this.instance.updateStatus(InstanceStatus.Ok)
							this.instance.log(
								'info',
								'Connected to QuikMatrix 4k' + serialAndFirmware()
							)
							newPlatform = 'midra'
						} else if (device.match(/^QVU/)) {
							this.instance.updateStatus(InstanceStatus.Ok)
							this.instance.log(
								'info',
								'Connected to QuickVu 4k' + serialAndFirmware()
							)
							newPlatform = 'midra'
						} else if (device.match(/^ZEN100/)) {
							this.instance.updateStatus(InstanceStatus.Ok)
							this.instance.log(
								'info',
								'Connected to Zenith 100' + serialAndFirmware()
							)
							newPlatform = 'midra'
						} else if (device.match(/^ZEN200/)) {
							this.instance.updateStatus(InstanceStatus.Ok)
							this.instance.log(
								'info',
								'Connected to Zenith 200' + serialAndFirmware()
							)
							newPlatform = 'midra'
						} else if (device.match(/^DBG/)) {
							this.instance.updateStatus(InstanceStatus.Ok)
							this.instance.log(
								'info',
								'Connected to MNG_DEBUG' + serialAndFirmware()
							)
							newPlatform = 'midra'
						} else {
							this.instance.updateStatus(InstanceStatus.ConnectionFailure)
							this.instance.log('error', `Connected to an AWJ device of type '${device}', firmware '${fwVersion}'. Device type or firmware can not be determined or is not compatible with this module`)
							return
						}

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
						

						try {
							const deviceMacaddr = this.instance.choices.getMACaddress()
							const configMacaddr = this.instance.config.macaddress.split(/[,:_.\s-]/).join(':')
							if (configMacaddr !== deviceMacaddr) {
								this.instance.config.macaddress = deviceMacaddr
								this.instance.saveConfig(this.instance.config)
							}
						} catch (error) {
							this.instance.log('error', 'getting MAC address from device failed ' + error)
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
					//const _device = setDevice()

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
					})

					this.websocket.on('close', () => {
						// console.log('ws closed', ev.toString(), this.shouldBeConnected ? 'should be connected' : 'should not be connected')
						if (this.shouldBeConnected) {
							this.instance.updateStatus(InstanceStatus.Disconnected)
							this.hadError = true
							// console.log('ws retry in', this.reconnectinterval)
							if (this.wsTimeout) clearTimeout(this.wsTimeout)
							this.wsTimeout = setTimeout(() => {
								this.connect(this.addr)
							}, this.reconnectinterval)
							this.reconnectinterval *= 1.2
							if (this.reconnectinterval > this.reconnectmax) this.reconnectinterval = this.reconnectmax
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
						// console.log('debug', 'incoming WS message '+ data.toString().substring(0, 400))
						if (
							isBinary != true
						) {
							// if (
							// 	data.toString().match(/"op":"replace","path":"\/system\/status\/current(Device)?Time","value":/) === null &&
							// 	data.toString().match(/"op":"(add|remove)","path":"\/system\/temperature\/externalTempHistory\//) === null &&
							// 	data.toString().match(/"device","system",("deviceList","items","[1-4]",)?"temperature",/) === null &&
							// 	data.toString().match(/"device","timerList","items","TIMER_\d+","status","pp","value"/) === null
							// ) {
							// 	console.log('debug', 'incoming WS message '+ data.toString().substring(0, 400))
							// }
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
						// Got succesful auth response
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
			// console.log('ws close and retry in', this.reconnectinterval)
			this.disconnect()
			if (this.wsTimeout) clearTimeout(this.wsTimeout)
			this.wsTimeout = setTimeout(() => {
				this.connect(this.addr)
			}, this.reconnectinterval)
			this.reconnectinterval *= 1.2
			if (this.reconnectinterval > this.reconnectmax) this.reconnectinterval = this.reconnectmax
			const retrysec = Math.round(this.reconnectinterval / 100)/10
			if(String(error).match(/fetch failed/)) {
				this.instance.updateStatus(InstanceStatus.ConnectionFailure, `Device unreachable, retrying in ${retrysec}s`)
				this.instance.log('error', `Can't connect to device, probably offline. Will retry in ${retrysec}s`)
			} else if(String(error).match(/terminated/)) {
				this.instance.updateStatus(InstanceStatus.ConnectionFailure, `Connection terminated, retrying in ${retrysec}s`)
				this.instance.log('error', `Connection to device has been terminated unexpectedly. Will retry in ${retrysec}s`)
			} else {
				this.instance.updateStatus(InstanceStatus.ConnectionFailure, `Connection failed, retrying in ${retrysec}s`)
				this.instance.log('error', `Can't connect to device webserver. ${error}\nWill retry in ${retrysec}s`)
			}
		}		
	}

	async downloadDevicestate(urlObj) {
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
		if (urlObj.username() !== 'Admin' && this.authcookie.length === 0) {
			ky.post(`${urlObj.protocol()}://${urlObj.host()}${urlObj.resource()}`,{
				body: message,
				headers: {
					'Content-Type': 'application/json'
				},
				...fetchDefaultParameters,
				redirect: 'error'
			})
				//.ok((res) => res.status < 400)
			.then((res) => {
				this.instance.log('debug', 'http POST successfull ' + res.status)
			})
			.catch((err) => {
				this.instance.log('debug', 'http POST failed ' + err)
			})
		} else if (this.authcookie.length > 0) { 
			ky.post(`${urlObj.protocol()}://${urlObj.host()}${urlObj.resource()}`,{
				body: message,
				headers: {
					'Content-Type': 'application/json',
					'Cookie': this.authcookie
				},
				...fetchDefaultParameters,
				redirect: 'error'
			})
				//.ok((res) => res.status < 400)
			.then((res) => {
				this.instance.log('debug', 'http POST successfull ' + res.status)
			})
			.catch((err) => {
				this.instance.log('debug', 'http POST failed ' + err)
			})
		} else if (urlObj.username() === 'Admin' && this.authcookie.length === 0) {
			ky.post(`${urlObj.protocol()}://${urlObj.host()}/auth/login`,{
				body: JSON.stringify({ password: urlObj.password() }),
				headers: {
					'Content-Type': 'application/json',
				},
				...fetchDefaultParameters,
				redirect: 'manual',
				throwHttpErrors: false
			})
				//.ok((res) => res.status < 400)
			.then((res) => {
				// Got succesful auth response
				// Note: res.headers is a Headers instance (fetch API), not a plain object - must use .get()
				const setCookie = res.headers.get('set-cookie')
				if (setCookie) {
					this.authcookie = setCookie
					this.instance.log('info', 'Login to device is successful')
				}
				ky.post(`${urlObj.protocol()}://${urlObj.host()}${urlObj.resource()}`,{
					body: message,
					headers: {
						'Content-Type': 'application/json',
						'Cookie': this.authcookie
					},
					...fetchDefaultParameters,
					redirect: 'error'
					})
					.then((res) => {
						this.instance.log('debug', 'http POST successfull ' + res.status)
					})
					.catch((err) => {
						this.instance.log('debug', 'http POST failed ' + err)
					})
			})
			.catch((err) => {
				this.instance.log('debug', 'http POST failed ' + err)
			})
		}
	} 

	disconnect(): void {
		clearTimeout(this.wsTimeout)
		this.shouldBeConnected = false
		this.hadError = false
		this.websocket?.close()
		//this.websocket = null
		// this.tcpsocket.destroy()
		this.buffer = ''
	}

	destroy(): void {
		clearTimeout(this.wsTimeout)
		this.shouldBeConnected = false
		this.hadError = false
		this.websocket?.close()
		this.websocket = null
		//this.tcpsocket.destroy()
		this.buffer = ''
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
			// this.instance.log('debug', 'sendig WS message ' + this.websocket.url + ' ' + message)
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
