import {AWJinstance} from '../index.js'
import { Subscription } from '../../types/Subscription.js'
import Subscriptions from '../awjdevice/subscriptions.js'
import { deciSceondsToString } from '../util.js'

/**
 * Class for managing and checking of the subscriptions.
 * A subscription is data of the device associated with a json path in the device model which we are interested in and need to react on changes.
 */
export default class SubscriptionsLivepremier extends Subscriptions {

	/**
	 * This member denotes the names of the subscriptions which are to be checked.
	 * May be overridden in child classes.
	 */
	readonly subscriptionsToUse: string[] = [
		// Common
		'syncselection',
		'screenPreset',
		'liveselection',
		'layerselection',
		'selectedLayerRect',
		'selectedLayerSelectionChange',
		'globalAnchorPointChange',
		'selectedLayerSourceChange',
		'selectedLayerSourceSignalChange',
		'selectedLayerOpacityChange',
		'selectedLayerCroppingChange',
		'layerPropertyStatusChange',
		'selectedScreenChange',
		'selectedScreenTbarChange',
		'selectedScreenTransitionTimeChange',
		'backupSetChange',
		'backupBackgroundSetChange',
		'backupGroupChange',
		'backupPrimarySignalChange',
		'widgetSelection',
		'screenLock',
		'sourceVisibility',
		'testpatternActive',
		'testpatternRasterBoxActive',
		'selectedPreset',
		'inputFreeze',
		'timerState',
		'gpioOut',
		'gpioIn',
		'screenTransitionTime',
		'screenMemoryLabel',
		'masterMemory',
		'masterMemoryLabel',
		'multiviewerMemoryLabel',
		'layerMemoryLabel',
		'stillLabel',
		'stillValid',
		'screenLabel',
		'auxscreenLabel',
		'screenEnabled',
		'liveInputsChange',
		'masterMemoriesChange',
		'screenMemoriesChange',
		'layerMemoriesChange',
		'multiviewerMemoriesChange',
		'layerCountChange',
		'memoryColorChange',
		// LivePremier
		'presetToggle',
		'screenMemoryChange',
		'screenMemoryModifiedChange',
		'screenTransitionTime',
		'screenMemoryLabel',
		'inputLabel',
		'screenSize',
		'layerVariables',
		'inputStatus',
		'outputUsedIn',
		'outputStatus',
		'outputLabel',
		'deviceIOCount',
		'outputPlugStatus',
		'multiviewerOutputStatus',
		'multiviewerEnabledChange',
		'deviceIdentity',
		'deviceHealth',
		'shutdown',
		'audioRouteChange',
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
			pat: 'device/gpio/gpoList/items/\\d/status/pp/state',
			fbk: 'deviceGpioOut',
		}
	}

	get gpioIn():Subscription {
		return {
			pat: 'device/gpio/gpiList/items/(\\d)/status/pp/state',
			fbk: 'deviceGpioIn',
		}
	}

	get screenTransitionTime():Subscription {
		return {
			pat: 'DEVICE/device/screenGroupList/items/((?:S|A)\\d{1,3})/control/pp/take(?:Up|Down)?Time',
			ini: ():string[] => {
				const presets = ['takeUpTime', 'takeDownTime']
				const screens: string[] = [
					...Array.from({ length: this.constants.maxScreens }, (_, i) => 'S' + (i + 1).toString()),
					...Array.from({ length: this.constants.maxAuxScreens }, (_, i) => 'A' + (i + 1).toString()),
					]
				const paths =  screens.reduce((cb: string[], screen) => cb.concat(presets.map((preset) => {
					return 'DEVICE/device/screenGroupList/items/'+ screen +'/control/pp/'+ preset
				})), [])
				return paths
			},
			fun: (path, _value) => {
				if (!path) return false
				const screen = Array.isArray(path) ? path[4] : path.split('/')[4]
				const pres = Array.isArray(path) ? path[7] : path.split('/')[7]
				const exists = [...this.instance.choices.getScreensArray(), ...this.instance.choices.getAuxArray()].some(scr => scr.id === screen)
				if (pres === 'takeUpTime') {
					const presname = 'B' === this.instance.state.get(`LOCAL/screens/${screen}/pgm/preset`) ? 'PVW' : 'PGM'
					const varId = this.varName(`screen${screen}time${presname}`, `${screen}.${presname === 'PVW' ? 'prw' : presname.toLowerCase()}.time`)
					const deciseconds = this.instance.state.get(path)
					if (exists) {
						this.instance.addVariable({ id: 'screenTransitionTime', variableId: varId, name: `Transition time for ${screen} ${presname}` })
					}
					this.instance.setVariableValues({
						[varId]: deciSceondsToString(deciseconds),
					})
				}
				if (pres === 'takeDownTime') {
					const presname = 'A' === this.instance.state.get(`LOCAL/screens/${screen}/pgm/preset`) ? 'PVW' : 'PGM'
					const varId = this.varName(`screen${screen}time${presname}`, `${screen}.${presname === 'PVW' ? 'prw' : presname.toLowerCase()}.time`)
					const deciseconds = this.instance.state.get(path)
					if (exists) {
						this.instance.addVariable({ id: 'screenTransitionTime', variableId: varId, name: `Transition time for ${screen} ${presname}` })
					}
					this.instance.setVariableValues({
						[varId]: deciSceondsToString(deciseconds),
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
			pat: 'DEVICE/device/screenList/items/A(\\d{1,2})/control/pp/label',
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
			pat: 'DEVICE/device/screenGroupList/items/(\\w+?)/status/pp/transition',
			fbk: 'deviceTake',
			ini: [
				...this.instance.choices.getScreensArray().map((s) => s.id),
				...this.instance.choices.getAuxArray().map((a) => a.id),
			],
			fun: (path, _value) => {
				const setMemoryVariables = (screen: string, preset: string, variableSuffix: string): void => {
					const newPresetSegment = variableSuffix === 'PVW' ? 'prw' : 'pgm'
					const mem = this.instance.state.get([
						'DEVICE',
						'device',
						'screenList', 'items', screen,
						'presetList', 'items', preset,
						'presetId',
						'status',
						'pp',
						'id',
					]);
					const unmodified = this.instance.state.get([
						'DEVICE',
						'device',
						'screenList', 'items', screen,
						'presetList', 'items', preset,
						'presetId',
						'status',
						'pp',
						'isNotModified',
					]);
					const memVarId = this.varName(`screen${screen}memory${variableSuffix}`, `${screen}.${newPresetSegment}.memory.active`)
					const modVarId = this.varName(`screen${screen}memoryModified${variableSuffix}`, `${screen}.${newPresetSegment}.memory.modified`)
					this.instance.addVariable({ id: 'screenPreset', variableId: memVarId, name: `Active memory for ${screen} ${variableSuffix}` })
					this.instance.addVariable({ id: 'screenPreset', variableId: modVarId, name: `Modified flag of active memory for ${screen} ${variableSuffix}` })
					this.instance.setVariableValues({ [memVarId]: mem ? 'M' + mem : '' });
					this.instance.setVariableValues({ [modVarId]: !!(mem && !unmodified) });
					this.instance.setVariableValues({
						[this.varName(`screen${screen}memoryLabel${variableSuffix}`, `${screen}.${newPresetSegment}.memory.label`)]: mem
							? this.instance.state.get(['DEVICE', 'device', 'presetBank', 'bankList', 'items', mem, 'control', 'pp', 'label'])
							: ''
					});
				};
				let patharr: string[];
				if (typeof path === 'string') {
					patharr = path.split('/');
				} else if (Array.isArray(path)) {
					patharr = path;
				} else {
					return false;
				}
				const val = this.instance.state.get(patharr);
				const screen = patharr[4];
				let program = '', preview = '';
				if (val === 'AT_UP') {
					program = 'B';
					preview = 'A';
					this.instance.state.set(`LOCAL/screens/${screen}/pgm/preset`, program);
					this.instance.state.set(`LOCAL/screens/${screen}/pvw/preset`, preview);
					this.instance.setVariableValues({
						[this.varName(`screen${screen}timePGM`, `${screen}.pgm.time`)]: deciSceondsToString(
							this.instance.state.get(['DEVICE', 'device', 'screenGroupList', 'items', screen, 'control', 'pp', 'takeUpTime'])
						)
					});
					this.instance.setVariableValues({
						[this.varName(`screen${screen}timePVW`, `${screen}.prw.time`)]: deciSceondsToString(
							this.instance.state.get(['DEVICE', 'device', 'screenGroupList', 'items', screen, 'control', 'pp', 'takeDownTime'])
						)
					});
					setMemoryVariables(screen, program, 'PGM');
					setMemoryVariables(screen, preview, 'PVW');
				}
				if (val === 'AT_DOWN') {
					program = 'A';
					preview = 'B';
					this.instance.state.set(`LOCAL/screens/${screen}/pgm/preset`, program);
					this.instance.state.set(`LOCAL/screens/${screen}/pvw/preset`, preview);
					this.instance.setVariableValues({
						[this.varName(`screen${screen}timePGM`, `${screen}.pgm.time`)]: deciSceondsToString(
							this.instance.state.get([
								'DEVICE',
								'device',
								'screenGroupList', 'items', screen,
								'control',
								'pp',
								'takeDownTime',
							])
						)
					});
					this.instance.setVariableValues({
						[this.varName(`screen${screen}timePVW`, `${screen}.prw.time`)]: deciSceondsToString(
							this.instance.state.get(['DEVICE', 'device', 'screenGroupList', 'items', screen, 'control', 'pp', 'takeUpTime'])
						)
					});
					setMemoryVariables(screen, program, 'PGM');
					setMemoryVariables(screen, preview, 'PVW');
				}
				this.instance.checkFeedbacks('deviceSourceTally', 'deviceScreenMemory', 'deviceTake');
				return false;
			},
		}
	}

	get screenMemoryChange():Subscription {
		return {
			pat: 'DEVICE/device/screenList/items/(S|A)\\d{1,3}/presetList/items/(A|B)/presetId/status/pp/id',
			fbk: 'deviceScreenMemory',
			fun: (path, value) => {
				if (!path) return false;
				const screen = Array.isArray(path) ? path[4] : path.split('/')[4];
				const pres = Array.isArray(path) ? path[7] : path.split('/')[7];
				const presname = pres === this.instance.state.get(`LOCAL/screens/${screen}/pgm/preset`) ? 'PGM' : 'PVW';
				const newPresetSegment = presname === 'PVW' ? 'prw' : 'pgm'
				const memorystr = value ? value.toString() : '';
				const memVarId = this.varName(`screen${screen}memory${presname}`, `${screen}.${newPresetSegment}.memory.active`)
				this.instance.addVariable({ id: 'screenMemoryChange', variableId: memVarId, name: `Active memory for ${screen} ${presname}` })
				this.instance.setVariableValues({ [memVarId]: memorystr });
				this.instance.setVariableValues({
					[this.varName(`screen${screen}memoryLabel${presname}`, `${screen}.${newPresetSegment}.memory.label`)]: memorystr !== ''
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
				return false;
			},
		}
	}

	get screenMemoryModifiedChange():Subscription {
		return {
			pat: 'DEVICE/device/screenList/items/(?:S|A)\\d{1,3}/presetList/items/(?:A|B)/presetId/status/pp/isNotModified',
			fbk: 'deviceScreenMemory',
			fun: (path, _value) => {
				if (!path) return false;
				const screen = Array.isArray(path) ? path[4] : path.split('/')[4];
				const pres = Array.isArray(path) ? path[7] : path.split('/')[7];
				const presname = pres === this.instance.state.get(`LOCAL/screens/${screen}/pgm/preset`) ? 'PGM' : 'PVW';
				const newPresetSegment = presname === 'PVW' ? 'prw' : 'pgm'
				const modVarId = this.varName(`screen${screen}memoryModified${presname}`, `${screen}.${newPresetSegment}.memory.modified`)
				this.instance.addVariable({ id: 'screenMemoryModifiedChange', variableId: modVarId, name: `Modified flag of active memory for ${screen} ${presname}` })
				this.instance.setVariableValues({
					[modVarId]: !!(this.instance.state.get(
						'DEVICE/device/screenList/items/' + screen + '/presetList/items/' + pres + '/presetId/status/pp/id'
					) && !this.instance.state.get(path))
				});
				return false;
			},
		}
	}

	get presetToggle():Subscription {
		return {
			pat: 'device/screenGroupList/items/S1/control/pp/copyMode',
			fbk: 'presetToggle'
		}
	}

	get audioRouteChange(): Subscription {
		return {
			pat: 'device/audio/control/txList/items/\\w+/channelList/items/\\d+/control/pp/source',
			fbk: ['deviceAudioRouteChannelsStatus', 'deviceAudioRouteBlockStatus'],
		}
	}

}

