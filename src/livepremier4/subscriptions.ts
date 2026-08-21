import {AWJinstance} from '../index.js'
import { Subscription } from '../../types/Subscription.js'
import Subscriptions from '../awjdevice/subscriptions.js'
import { deciSceondsToString } from '../util.js'

/**
 * Class for managing and checking of the subscriptions.
 * A subscription is data of the device associated with a json path in the device model which we are interested in and need to react on changes.
 */
export default class SubscriptionsLivepremier4 extends Subscriptions {

	/**
	 * This member denotes the names of the subscriptions which are to be checked.
	 * May be overridden in child classes.
	 */
	readonly subscriptionsToUse: string[] = [
		// Common
		'syncselection',
		'screenPreset',
		'screenEnabled',
		'liveInputsChange',
		'liveselection',
		'layerselection',
		'selectedLayerRect',
		'selectedLayerSelectionChange',
		'globalAnchorPointChange',
		'selectedLayerSourceChange',
		'selectedLayerSourceSignalChange',
		'selectedScreenChange',
		'widgetSelection',
		'screenLock',
		'sourceVisibility',
		'testpatternActive',
		'testpatternRasterBoxActive',
		'selectedPreset',
		'inputFreeze',
		'timerState',
		'screenTransitionTime',
		'screenMemoryLabel',
		'masterMemory',
		'masterMemoryLabel',
		'multiviewerMemoryLabel',
		'layerMemoryLabel',
		'stillLabel',
		'stillValid',
		'stillLibraryChange',
		'screenLabel',
		'auxscreenLabel',
		'masterMemoriesChange',
		'screenMemoriesChange',
		'layerMemoriesChange',
		'multiviewerMemoriesChange',
		'layerCountChange',
		'memoryColorChange',
		// LivePremier
		'gpioOut',
		'gpioIn',
		'presetToggle',
		'screenMemoryChange',
		'screenMemoryModifiedChange',
		'screenTransitionTime',
		'screenMemoryLabel',
		'inputLabel',
		'screenSize',
		'outputStatus',
		'outputLabel',
		'deviceIOCount',
		'outputPlugStatus',
		'multiviewerOutputStatus',
		'deviceIdentity',
		'deviceHealth',
		'shutdown',
		//LivePremier4
		'timerValue',
		// Midra
		// 'presetToggle',
		// 'screenPreset',
		// 'backgroundSet',
		// 'screenMemoryChange',
		// 'screenMemoryLabel',
		// 'screenMemoryModifiedChange',
		// 'auxMemoryLabel',
		// 'plugChange',
		// 'inputLabel',
		// 'auxMemoriesChange',
		// 'liveLayerFreeze',
		// 'backgroundLayerFreeze',
		// 'screenFreeze',
		// 'streamStatus',
		// 'standby',
		// 'shutdown',
	]

	constructor(instance: AWJinstance) {
		super(instance)
		this.instance = instance
		this.constants = this.instance.constants

		this.subscriptions = Object.fromEntries(
            this.subscriptionsToUse.map((key) => [key, this[key]])
        )
	}

	get gpioOut():Subscription {
		return {
			pat: 'device/gpios/deviceList/items/\\d+/gpoList/items/\\d/status/pp/state',
			fbk: 'deviceGpioOut',
		}
	}

	get gpioIn():Subscription {
		return {
			pat: 'device/gpios/deviceList/items/\\d+/gpiList/items/\\d/status/pp/state',
			fbk: 'deviceGpioIn',
		}
	}

	get screenTransitionTime():Subscription {
		return {
			pat: 'DEVICE/device/screenAuxGroupList/items/((?:S|A)\\d{1,3})/control/pp/take(?:Up|Down)?Time',
			ini: ():string[] => {
				const screens: string[] = [
					...Array.from({ length: this.constants.maxScreens }, (_, i) => `S${i+1}`),
					...Array.from({ length: this.constants.maxAuxScreens }, (_, i) => `A${i+1}`),
					]
				const paths = [
					...screens.map(screen => `DEVICE/device/screenAuxGroupList/items/${screen}/control/pp/takeUpTime`),
					...screens.map(screen => `DEVICE/device/screenAuxGroupList/items/${screen}/control/pp/takeDownTime`),
				]
				return paths
			},
			fun: (path, _value) => {
				if (!path) return false
				const screen = Array.isArray(path) ? path[4] : path.split('/')[4]
				const pres = Array.isArray(path) ? path[7] : path.split('/')[7]
				const exists = [...this.instance.choices.getScreensArray(), ...this.instance.choices.getAuxArray()].some(scr => scr.id === screen)
				if (pres === 'takeUpTime') {
					const presname = 'B' === this.instance.state.get(`LOCAL/screens/${screen}/pgm/preset`) ? 'PVW' : 'PGM'
					const varId = this.varName(`screen${screen}time${presname}`, `${screen}.${presname.toLowerCase()}.time`)
					const deciseconds = this.instance.state.get(path)
					if (exists) {
						this.instance.addVariable({ id: 'screenTransitionTime', variableId: varId, name: `Transition time for ${screen} ${presname}` })
						this.instance.addVariable({ id: 'screenTransitionTime', variableId: `${varId}.ms`, name: `Transition time for ${screen} ${presname} (ms)` })
					}
					this.instance.setVariableValues({
						[varId]: deciSceondsToString(deciseconds),
						[`${varId}.ms`]: deciseconds * 100,
					})
				}
				if (pres === 'takeDownTime') {
					const presname = 'A' === this.instance.state.get(`LOCAL/screens/${screen}/pgm/preset`) ? 'PVW' : 'PGM'
					const varId = this.varName(`screen${screen}time${presname}`, `${screen}.${presname.toLowerCase()}.time`)
					const deciseconds = this.instance.state.get(path)
					if (exists) {
						this.instance.addVariable({ id: 'screenTransitionTime', variableId: varId, name: `Transition time for ${screen} ${presname}` })
						this.instance.addVariable({ id: 'screenTransitionTime', variableId: `${varId}.ms`, name: `Transition time for ${screen} ${presname} (ms)` })
					}
					this.instance.setVariableValues({
						[varId]: deciSceondsToString(deciseconds),
						[`${varId}.ms`]: deciseconds * 100,
					})
				}

				return false
			},
		}
	}

	get screenLabel():Subscription {
		return {
			pat: 'DEVICE/device/screenList/items/S(\\d{1,2})/control/pp/label',
			ini: Array.from({ length: this.constants.maxScreens }, (_, i) => (i + 1).toString()),
			fun: (path, _value) => {
				if (!path) return false
				const input = Array.isArray(path) ? path[4] : path.split('/')[4]
				const label = this.instance.state.get(path)
				const exists = this.instance.state.get(path.toString().replace('control/pp/label', 'status/pp/mode')) !== 'DISABLED'
				if (this.instance.config.useOldVariableNames) {
					if (exists) {
						this.instance.addVariable({ id: 'screenLabel', variableId: `${input.replace('S', 'SCREEN_')}label`, name: `Label of Screen ${input}` })
						this.instance.addVariable({ id: 'screenLabel', variableId: `screen${input}label`, name: `Label of Screen ${input}` })
					}
					this.instance.setVariableValues({[input.replace('S', 'SCREEN_') + 'label']: label})
					this.instance.setVariableValues({['screen' + input + 'label']: label})
				} else {
					if (exists) {
						this.instance.addVariable({ id: 'screenLabel', variableId: `${input}.label`, name: `Label of Screen ${input}` })
					}
					this.instance.setVariableValues({[`${input}.label`]: label})
				}
				return true
			},
		}
	}

	get auxscreenLabel():Subscription {
		return {
			pat: 'DEVICE/device/auxiliaryList/items/A(\\d{1,2})/control/pp/label',
			ini: Array.from({ length: this.constants.maxAuxScreens }, (_, i) => (i + 1).toString()),
			fun: (path, _value) => {
				if (!path) return false
				const input = Array.isArray(path) ? path[4] : path.split('/')[4]
				const label = this.instance.state.get(path)
				const exists = this.instance.state.get(path.toString().replace('control/pp/label', 'status/pp/mode')) !== 'DISABLED'
				if (this.instance.config.useOldVariableNames) {
					if (exists) {
						this.instance.addVariable({ id: 'auxscreenLabel', variableId: `${input.replace('A', 'AUXSCREEN_')}label`, name: `Label of Auxscreen ${input}` })
						this.instance.addVariable({ id: 'auxscreenLabel', variableId: `screen${input}label`, name: `Label of Auxscreen ${input}` })
					}
					this.instance.setVariableValues({[input.replace('A', 'AUXSCREEN_') + 'label']: label})
					this.instance.setVariableValues({['screen' + input + 'label']: label})
				} else {
					if (exists) {
						this.instance.addVariable({ id: 'auxscreenLabel', variableId: `${input}.label`, name: `Label of Auxscreen ${input}` })
					}
					this.instance.setVariableValues({[`${input}.label`]: label})
				}
				return true
			},
		}
	}

	get screenPreset():Subscription {
		return {
			pat: 'DEVICE/device/screenAuxGroupList/items/(\\w+?)/status/pp/transition',
			fbk: 'deviceTake',
			ini: [
				...Array.from({ length: this.constants.maxScreens }, (_, i) => 'S' + (i + 1).toString()),
				...Array.from({ length: this.constants.maxAuxScreens }, (_, i) => 'A' + (i + 1).toString()),
			],
			fun: (path, _value) => {
				const setMemoryVariables = (preset: string, variableSuffix: string): void => {
					const mempath = ['DEVICE', 'device', 'presetBank', 'status', 'presetId', screenList, 'items', screen, 'presetList', 'items', preset, 'pp']
					const mem = this.instance.state.get([
						...mempath,
						'id',
					])
					const unmodified = this.instance.state.get([
						...mempath,
						'isNotModified',
					])
					const memVarId = 'screen' + screen + 'memory' + variableSuffix
					const modVarId = 'screen' + screen + 'memoryModified' + variableSuffix
					this.instance.addVariable({ id: 'screenPreset', variableId: memVarId, name: `Active memory for ${screen} ${variableSuffix}` })
					this.instance.addVariable({ id: 'screenPreset', variableId: modVarId, name: `Modified flag of active memory for ${screen} ${variableSuffix}` })
					this.instance.setVariableValues({ [memVarId]: mem ? 'M' + mem : '' });
					this.instance.setVariableValues({ [modVarId]: mem && !unmodified ? '*' : '' });
					this.instance.setVariableValues({
						['screen' + screen + 'memoryLabel' + variableSuffix]: mem
							? this.instance.state.get(['DEVICE', 'device', 'presetBank', 'bankList', 'items', mem, 'control', 'pp', 'label'])
							: ''
					})
				}
				let patharr: string[]
				if (typeof path === 'string') {
					patharr = path.split('/')
				} else if (Array.isArray(path)) {
					patharr = path
				} else {
					return false
				}
				const val = this.instance.state.get(patharr)
				const screen = patharr[4]
				const screenList = screen.charAt(0) === 'A' ? 'auxiliaryList' : 'screenList'
				let program = '', preview = ''
				if (val === 'AT_UP') {
					program = 'B'
					preview = 'A'
					this.instance.state.set(`LOCAL/screens/${screen}/pgm/preset`, program)
					this.instance.state.set(`LOCAL/screens/${screen}/pvw/preset`, preview)
					this.instance.setVariableValues({
						[this.varName(`screen${screen}timePGM`, `${screen}.pgm.time`)]: deciSceondsToString(
							this.instance.state.get(['DEVICE', 'device', 'screenAuxGroupList', 'items', screen, 'control', 'pp', 'takeUpTime'])
						)
					});
					this.instance.setVariableValues({
						[this.varName(`screen${screen}timePVW`, `${screen}.pvw.time`)]: deciSceondsToString(
							this.instance.state.get(['DEVICE', 'device', 'screenAuxGroupList', 'items', screen, 'control', 'pp', 'takeDownTime'])
						)
					});
					setMemoryVariables(program, 'PGM')
					setMemoryVariables(preview, 'PVW')
				}
				if (val === 'AT_DOWN') {
					program = 'A'
					preview = 'B'
					this.instance.state.set(`LOCAL/screens/${screen}/pgm/preset`, program)
					this.instance.state.set(`LOCAL/screens/${screen}/pvw/preset`, preview)
					this.instance.setVariableValues({
						[this.varName(`screen${screen}timePGM`, `${screen}.pgm.time`)]: deciSceondsToString(
							this.instance.state.get([
								'DEVICE',
								'device',
								'screenAuxGroupList', 'items', screen,
								'control',
								'pp',
								'takeDownTime',
							])
						)
					})
					this.instance.setVariableValues({
						[this.varName(`screen${screen}timePVW`, `${screen}.pvw.time`)]: deciSceondsToString(
							this.instance.state.get(['DEVICE', 'device', 'screenAuxGroupList', 'items', screen, 'control', 'pp', 'takeUpTime'])
						)
					})
					setMemoryVariables(program, 'PGM')
					setMemoryVariables(preview, 'PVW')
				}
				this.instance.checkFeedbacks('deviceSourceTally', 'deviceScreenMemory', 'deviceTake')
				return false
			},
		}
	}

	get screenMemoryChange():Subscription {
		return {
			pat: 'DEVICE/device/presetBank/status/presetId/(?:screen|auxiliary)List/items/(?:S|A)\\d{1,3}/presetList/items/(?:A|B)/pp/id',
			fbk: 'deviceScreenMemory',
			fun: (path, value) => {
				if (!path) return false
				const screen = Array.isArray(path) ? path[7] : path.split('/')[7]
				const pres = Array.isArray(path) ? path[10] : path.split('/')[10]
				const presname = pres === this.instance.state.get(`LOCAL/screens/${screen}/pgm/preset`) ? 'PGM' : 'PVW'
				const memorystr = value ? value.toString() : ''
				const memVarId = 'screen' + screen + 'memory' + presname
				this.instance.addVariable({ id: 'screenMemoryChange', variableId: memVarId, name: `Active memory for ${screen} ${presname}` })
				this.instance.setVariableValues({ [memVarId]:  memorystr !== '' ? 'M' + memorystr : '' })
				this.instance.setVariableValues({
					['screen' + screen + 'memoryLabel' + presname]: memorystr !== ''
						? this.instance.state.get([
							'DEVICE',
							'device',
							'presetBank',
							'bankList',
							'items',
							memorystr,
							'control',
							'pp',
							'label',
						])
						: ''
				});
				return false
			},
		}
	}

	get screenMemoryModifiedChange():Subscription {
		return {
			pat: 'DEVICE/device/presetBank/status/presetId/(?:screen|auxiliary)List/items/(?:S|A)\\d{1,3}/presetList/items/(?:A|B)/pp/isNotModified',
			fbk: 'deviceScreenMemory',
			fun: (path, _value) => {
				if (!path) return false;
				const screenList = Array.isArray(path) ? path[5] : path.split('/')[5]
				const screen = Array.isArray(path) ? path[7] : path.split('/')[7]
				const pres = Array.isArray(path) ? path[10] : path.split('/')[10]
				const presname = pres === this.instance.state.get(`LOCAL/screens/${screen}/pgm/preset`) ? 'PGM' : 'PVW'
				const modVarId = 'screen' + screen + 'memoryModified' + presname
				this.instance.addVariable({ id: 'screenMemoryModifiedChange', variableId: modVarId, name: `Modified flag of active memory for ${screen} ${presname}` })
				this.instance.setVariableValues({
					[modVarId]: this.instance.state.get(
						['DEVICE','device','presetBank','status','presetId',screenList,'items',screen,'presetList','items',pres,'pp','id']
					) && !this.instance.state.get(path)
						? '*'
						: ''
				})
				return false
			},
		}
	}

	get presetToggle():Subscription {
		return {
			pat: 'device/screenAuxGroupList/items/S1/control/pp/copyMode',
			fbk: 'presetToggle'
		}
	}

	get timerValue():Subscription {
		return {
			pat: 'DEVICE/device/timerList/items/TIMER_(\\d+)/status/pp/value',
			ini: Array.from({ length: this.constants.maxTimers }, (_, i) => (i + 1).toString()),
			fun: (path, _value) => {
				if (!path) return false
				const timer = ( Array.isArray(path) ? path[4] : path.split('/')[4] ).replaceAll(/\D/g, '')
				const time = this.instance.state.get(path)

				const varId = this.varName(`timer${timer}`, `TIMER${timer}.value`)
				this.instance.addVariable({ id: 'timerValue', variableId: varId, name: `Current time of Timer ${timer} (ms)` })
				this.instance.setVariableValues({[varId]: time})

				const ms = typeof time === 'number' ? time : 0
				const h = Math.floor(ms / 3600000)
				const m = Math.floor((ms % 3600000) / 60000)
				const s = Math.floor((ms % 60000) / 1000)
				const pad = (n: number) => n.toString().padStart(2, '0')
				this.instance.addVariable({ id: 'timerValue', variableId: `TIMER${timer}.value.hms`, name: `Current time of Timer ${timer} (hh:mm:ss)` })
				this.instance.addVariable({ id: 'timerValue', variableId: `TIMER${timer}.value.h`, name: `Current time of Timer ${timer}, hours` })
				this.instance.addVariable({ id: 'timerValue', variableId: `TIMER${timer}.value.m`, name: `Current time of Timer ${timer}, minutes` })
				this.instance.addVariable({ id: 'timerValue', variableId: `TIMER${timer}.value.s`, name: `Current time of Timer ${timer}, seconds` })
				this.instance.setVariableValues({
					[`TIMER${timer}.value.hms`]: `${pad(h)}:${pad(m)}:${pad(s)}`,
					[`TIMER${timer}.value.h`]: h,
					[`TIMER${timer}.value.m`]: m,
					[`TIMER${timer}.value.s`]: s,
				})

				return false
			}
		}
	}

}

