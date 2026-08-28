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
		'selectedLayerOpacityChange',
		'selectedLayerCroppingChange',
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
		'screenExistenceChange',
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
				...this.instance.choices.getScreensArray().map((s) => s.id),
				...this.instance.choices.getAuxArray().map((a) => a.id),
			],
			fun: (path, _value) => {
				const setMemoryVariables = (preset: string, variableSuffix: string): void => {
					const newPresetSegment = variableSuffix === 'PVW' ? 'prw' : 'pgm'
					const mempath = ['DEVICE', 'device', 'presetBank', 'status', 'presetId', screenList, 'items', screen, 'presetList', 'items', preset, 'pp']
					const mem = this.instance.state.get([
						...mempath,
						'id',
					])
					const unmodified = this.instance.state.get([
						...mempath,
						'isNotModified',
					])
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
						[this.varName(`screen${screen}timePVW`, `${screen}.prw.time`)]: deciSceondsToString(
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
						[this.varName(`screen${screen}timePVW`, `${screen}.prw.time`)]: deciSceondsToString(
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
				const newPresetSegment = presname === 'PVW' ? 'prw' : 'pgm'
				const memorystr = value ? value.toString() : ''
				const memVarId = this.varName(`screen${screen}memory${presname}`, `${screen}.${newPresetSegment}.memory.active`)
				this.instance.addVariable({ id: 'screenMemoryChange', variableId: memVarId, name: `Active memory for ${screen} ${presname}` })
				this.instance.setVariableValues({ [memVarId]:  memorystr !== '' ? 'M' + memorystr : '' })
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
				const newPresetSegment = presname === 'PVW' ? 'prw' : 'pgm'
				const modVarId = this.varName(`screen${screen}memoryModified${presname}`, `${screen}.${newPresetSegment}.memory.modified`)
				this.instance.addVariable({ id: 'screenMemoryModifiedChange', variableId: modVarId, name: `Modified flag of active memory for ${screen} ${presname}` })
				this.instance.setVariableValues({
					[modVarId]: !!(this.instance.state.get(
						['DEVICE','device','presetBank','status','presetId',screenList,'items',screen,'presetList','items',pres,'pp','id']
					) && !this.instance.state.get(path))
				})
				return false
			},
		}
	}

	/**
	 * A screen or aux's own status.pp.mode changes (enabled <-> disabled) - explicitly registers/deregisters
	 * every "legacy" (pre-V3, old/new-name-dual-support) per-screen variable this platform's own
	 * subscriptions build up over time: .label, .pgm/.prw.time, .pgm/.prw.memory.active/.modified/.label.
	 * None of screenLabel/auxscreenLabel/screenTransitionTime/screenPreset/screenMemoryChange/
	 * screenMemoryModifiedChange/screenMemoryLabel (the last one lives in the base class) ever call
	 * removeVariable themselves, and several of them independently addVariable the SAME variableId under
	 * their OWN internal tracking id - since a variable stays exposed as long as ANY tracked id still
	 * references it (see addVariable's own dedup-by-(id,variableId) comment in index.ts), removing under only
	 * one owning id while another lingers would be a no-op from the user's point of view. So on disable, this
	 * removes each variableId under every id that could plausibly have registered it. On (re-)enable, it
	 * populates fresh values under one canonical id ('screenExistenceChange' for .label/.time, the same ids
	 * the memory-related variables already use elsewhere so a later real memory-recall/Take doesn't fight
	 * over ownership).
	 * Live-confirmed user-reported gap this fixes: disabling S4/S5/S6 left .label/.pgm.time/.prw.time/
	 * .pgm.memory.active/.prw.memory.active/.pgm.memory.modified/.prw.memory.modified stuck with their last
	 * value forever, since none of the owning functions react to status.pp.mode at all - and reflects the
	 * same "existence = the signal" philosophy already applied to screenSize/layerVariables/inputStatus
	 * tonight, for this older/legacy generation of screen variables too.
	 * Uses presetUp directly (not choices.getPreset()) for the same reason refreshSelectedScreen/
	 * refreshLayerVariables do - see their own comments and [[project_feature_requests]].
	 */
	get screenExistenceChange():Subscription {
		const screens: string[] = [
			...Array.from({ length: this.constants.maxScreens }, (_, i) => `S${i + 1}`),
			...Array.from({ length: this.constants.maxAuxScreens }, (_, i) => `A${i + 1}`),
		]
		const listPathFor = (screen: string) => (screen.charAt(0) === 'A' ? 'auxiliaryList' : 'screenList')
		const modePathFor = (screen: string) => `DEVICE/device/${listPathFor(screen)}/items/${screen}/status/pp/mode`
		const labelPathFor = (screen: string) => `DEVICE/device/${listPathFor(screen)}/items/${screen}/control/pp/label`

		const memInfo = (screen: string, preset: string) => {
			const mempath = ['DEVICE', 'device', 'presetBank', 'status', 'presetId', listPathFor(screen), 'items', screen, 'presetList', 'items', preset, 'pp']
			const mem = this.instance.state.get([...mempath, 'id'])
			const unmodified = this.instance.state.get([...mempath, 'isNotModified'])
			const label = mem ? this.instance.state.get(['DEVICE', 'device', 'presetBank', 'bankList', 'items', mem, 'control', 'pp', 'label']) : ''
			return { mem, unmodified, label }
		}

		const refresh = (screen: string): void => {
			const exists = this.instance.state.get(modePathFor(screen)) !== 'DISABLED'
			const kind = screen.charAt(0) === 'A' ? 'Auxscreen' : 'Screen'
			const labelOwnerId = screen.charAt(0) === 'A' ? 'auxscreenLabel' : 'screenLabel'
			const oldLabelPrefix = screen.charAt(0) === 'A' ? screen.replace('A', 'AUXSCREEN_') : screen.replace('S', 'SCREEN_')

			if (!exists) {
				for (const ownerId of [labelOwnerId, 'screenExistenceChange']) {
					this.instance.removeVariable(ownerId, `${oldLabelPrefix}label`)
					this.instance.removeVariable(ownerId, `screen${screen}label`)
					this.instance.removeVariable(ownerId, `${screen}.label`)
				}
				for (const presname of ['PGM', 'PVW']) {
					const seg = presname === 'PVW' ? 'prw' : 'pgm'
					for (const ownerId of ['screenTransitionTime', 'screenExistenceChange']) {
						this.instance.removeVariable(ownerId, `screen${screen}time${presname}`)
						this.instance.removeVariable(ownerId, `${screen}.${seg}.time`)
					}
					for (const ownerId of ['screenPreset', 'screenMemoryChange']) {
						this.instance.removeVariable(ownerId, `screen${screen}memory${presname}`)
						this.instance.removeVariable(ownerId, `${screen}.${seg}.memory.active`)
					}
					for (const ownerId of ['screenPreset', 'screenMemoryModifiedChange']) {
						this.instance.removeVariable(ownerId, `screen${screen}memoryModified${presname}`)
						this.instance.removeVariable(ownerId, `${screen}.${seg}.memory.modified`)
					}
					for (const ownerId of ['screenPreset', 'screenMemoryLabel']) {
						this.instance.removeVariable(ownerId, `screen${screen}memoryLabel${presname}`)
						this.instance.removeVariable(ownerId, `${screen}.${seg}.memory.label`)
					}
				}
				return
			}

			const label = this.instance.state.get(labelPathFor(screen))
			const presetUp = this.instance.state.get(['DEVICE', ...this.constants.screenGroupPath, 'items', screen, 'control', 'pp', 'presetUp'])
			const takeUpTime = this.instance.state.get(['DEVICE', ...this.constants.screenGroupPath, 'items', screen, 'control', 'pp', 'takeUpTime'])
			const takeDownTime = this.instance.state.get(['DEVICE', ...this.constants.screenGroupPath, 'items', screen, 'control', 'pp', 'takeDownTime'])
			const pgmPreset = presetUp === 'B' ? 'B' : 'A'
			const pvwPreset = pgmPreset === 'A' ? 'B' : 'A'
			const pgmTime = pgmPreset === 'A' ? takeUpTime : takeDownTime
			const pvwTime = pgmPreset === 'A' ? takeDownTime : takeUpTime
			const pgmMem = memInfo(screen, pgmPreset)
			const pvwMem = memInfo(screen, pvwPreset)

			if (this.instance.config.useOldVariableNames) {
				this.instance.addVariable({ id: labelOwnerId, variableId: `${oldLabelPrefix}label`, name: `Label of ${kind} ${screen}` })
				this.instance.addVariable({ id: labelOwnerId, variableId: `screen${screen}label`, name: `Label of ${kind} ${screen}` })
				this.instance.setVariableValues({ [`${oldLabelPrefix}label`]: label, [`screen${screen}label`]: label })
				this.instance.addVariable({ id: 'screenTransitionTime', variableId: `screen${screen}timePGM`, name: `Transition time for ${screen} PGM` })
				this.instance.addVariable({ id: 'screenTransitionTime', variableId: `screen${screen}timePVW`, name: `Transition time for ${screen} PVW` })
				this.instance.setVariableValues({
					[`screen${screen}timePGM`]: deciSceondsToString(pgmTime),
					[`screen${screen}timePVW`]: deciSceondsToString(pvwTime),
				})
				for (const [presname, mem] of [['PGM', pgmMem], ['PVW', pvwMem]] as const) {
					this.instance.addVariable({ id: 'screenPreset', variableId: `screen${screen}memory${presname}`, name: `Active memory for ${screen} ${presname}` })
					this.instance.addVariable({ id: 'screenPreset', variableId: `screen${screen}memoryModified${presname}`, name: `Modified flag of active memory for ${screen} ${presname}` })
					this.instance.addVariable({ id: 'screenPreset', variableId: `screen${screen}memoryLabel${presname}`, name: `Label of memory for ${screen} ${presname}` })
					this.instance.setVariableValues({
						[`screen${screen}memory${presname}`]: mem.mem ? 'M' + mem.mem : '',
						[`screen${screen}memoryModified${presname}`]: !!(mem.mem && !mem.unmodified),
						[`screen${screen}memoryLabel${presname}`]: mem.label ?? '',
					})
				}
			} else {
				this.instance.addVariable({ id: labelOwnerId, variableId: `${screen}.label`, name: `Label of ${kind} ${screen}` })
				this.instance.setVariableValues({ [`${screen}.label`]: label })
				this.instance.addVariable({ id: 'screenTransitionTime', variableId: `${screen}.pgm.time`, name: `Transition time for ${screen} PGM` })
				this.instance.addVariable({ id: 'screenTransitionTime', variableId: `${screen}.prw.time`, name: `Transition time for ${screen} PVW` })
				this.instance.setVariableValues({
					[`${screen}.pgm.time`]: deciSceondsToString(pgmTime),
					[`${screen}.prw.time`]: deciSceondsToString(pvwTime),
				})
				for (const [seg, mem] of [['pgm', pgmMem], ['prw', pvwMem]] as const) {
					this.instance.addVariable({ id: 'screenPreset', variableId: `${screen}.${seg}.memory.active`, name: `Active memory for ${screen} ${seg}` })
					this.instance.addVariable({ id: 'screenPreset', variableId: `${screen}.${seg}.memory.modified`, name: `Modified flag of active memory for ${screen} ${seg}` })
					this.instance.addVariable({ id: 'screenPreset', variableId: `${screen}.${seg}.memory.label`, name: `Label of memory for ${screen} ${seg}` })
					this.instance.setVariableValues({
						[`${screen}.${seg}.memory.active`]: mem.mem ? 'M' + mem.mem : '',
						[`${screen}.${seg}.memory.modified`]: !!(mem.mem && !mem.unmodified),
						[`${screen}.${seg}.memory.label`]: mem.label ?? '',
					})
				}
			}
		}

		return {
			pat: 'device/(?:screenList|auxiliaryList)/items/\\w+/status/pp/mode',
			ini: () => {
				for (const screen of screens) refresh(screen)
				return []
			},
			fun: (path) => {
				if (!path || typeof path !== 'string') return false
				const match = path.match(/items\/([SA]\d+)\/status\/pp\/mode/)
				if (!match) return false
				refresh(match[1])
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

