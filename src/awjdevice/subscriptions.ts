import {AWJinstance} from '../index.js'
import { Subscription } from '../../types/Subscription.js'
import { InstanceStatus } from '@companion-module/base'
import Constants from './constants.js'

/**
 * Class for managing and checking of the subscriptions.
 * A subscription is data of the device associated with a json path in the device model which we are interested in and need to react on changes.
 */
export default class Subscriptions {
	instance: AWJinstance
	subscriptions: Record<string, Subscription>
	constants: typeof Constants

	/**
	 * This member denotes the names of the subscriptions which are to be checked.
	 * May be overridden in child classes.
	 */
	readonly subscriptionsToUse: string[] = [
		// ******** Common ********
		'syncselection',
		// 'liveselection',
		// 'layerselection',
		// 'selectedLayerRect',
		// 'selectedLayerSelectionChange',
		// 'globalAnchorPointChange',
		// 'selectedLayerSourceChange',
		// 'selectedLayerSourceSignalChange',
		// 'selectedScreenChange',
		// 'widgetSelection',
		// 'screenLock',
		// 'sourceVisibility',
		// 'selectedPreset',
		// 'inputFreeze',
		// 'timerState',
		// 'gpioOut',
		// 'gpioIn',
		// 'screenTransitionTime',
		// 'screenMemoryLabel',
		// 'masterMemory',
		// 'masterMemoryLabel',
		// 'multiviewerMemoryLabel',
		// 'layerMemoryLabel',
		// 'stillLabel',
		// 'stillValid',
		// 'stillLibraryChange',
		// 'screenLabel',
		// 'auxscreenLabel',
		// 'screenEnabled',
		// 'liveInputsChange',
		// 'masterMemoriesChange',
		// 'screenMemoriesChange',
		// 'layerMemoriesChange',
		// 'multiviewerMemoriesChange',
		// 'layerCountChange',
		// 'memoryColorChange',
		// ******** LivePremier ********
		// 'presetToggle',
		// 'screenPreset',
		// 'screenMemoryChange',
		// 'screenMemoryModifiedChange',
		// 'screenTransitionTime',
		// 'screenMemoryLabel',
		// 'inputLabel',
		// 'shutdown',
		// ******** Midra ********
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
		this.instance = instance
		this.constants = this.instance.constants

		this.subscriptions = Object.fromEntries(
            this.subscriptionsToUse.map((key) => [key, this[key]])
        )
	}

	/**
	 * Picks the old (V2) or new (V3) id for a dynamic variable, based on the "Use old (V2) variable names"
	 * config checkbox. Existing configs are upgraded to keep using the old names automatically (see upgrades.ts).
	 */
	varName(oldName: string, newName: string): string {
		return this.instance.config.useOldVariableNames ? oldName : newName
	}

	/**
	 * The names of the currently active subscriptions
	 */
	get subscriptionList() {
		return Object.keys(this.subscriptions)
	}

	/**
	 * Adds one or more subscriptions to the active subscriptions
	 * @param subscriptions Object containing one or more subscriptions 
	 */
	public addSubscriptions(subscriptions: Record<string, Subscription>): void {
		Object.keys(subscriptions).forEach(subscription => {
			this.subscriptions[subscription] = subscriptions[subscription]
		})
	}

	/**
	 * Removes the subscription with the given ID  from the active subscriptions
	 * @param subscriptionId ID of the subscription to remove
	 */
	public removeSubscription(subscriptionId: string): void {
		if (this.subscriptions[subscriptionId]) delete this.subscriptions[subscriptionId]
	}

	/**
	 * Get a specific subscription definition
	 * @param subscription 
	 * @returns 
	 */
	subscription(subscription: string) {
		return this.subscriptions[subscription]
	}

	/** Does a client sync its selection to server? */
	get syncselection():Subscription {
		return {
			pat: this.constants.subSyncselectionPat,
			fbk: 'syncselection',
		}
	}

	/** Selected screens change */
	get liveselection():Subscription {
		return {
			pat: 'live/screens/screenAuxSelection',
			fbk: 'liveScreenSelection',
		}
	}

	/** Selected layers change */
	get layerselection():Subscription {
		return {
			pat: 'live/screens/layerSelection/layerIds',
			fbk: 'remoteLayerSelection',
		}
	}

	/** Selected multiviewer widgets change */
	get widgetSelection():Subscription {
		return {
			pat: 'live/multiviewers?/widgetSelection',
			fbk: 'remoteWidgetSelection',
		}
	}

	/** Lock status of a screen changes */
	get screenLock():Subscription {
		return {
			pat: 'live/screens/presetModeLock/PR',
			fbk: 'liveScreenLock',
		}
	}

	/** Any parameter that has relevance for the visibility of a source changes (source, position, size, opacity, crop, mask) */
	get sourceVisibility():Subscription {
		return {
			pat: 'device/(auxiliaryScreen|screen|auxiliary)List/items/(S|A)?(\\d{1,3})/presetList/items/(\\w+)/l(iveL)?ayerList/items/(\\d{1,3}|NATIVE)/(source|position|size|opacity|crop|mask)',
			fbk: 'deviceSourceTally',
		}
	}

	/** A screen's/output's/input's testpattern (type or enable state) changes */
	get testpatternActive():Subscription {
		return {
			pat: 'device/(?:screenList|outputList|inputList)/items/\\w+/pattern/control/pp/(?:type|inhibit)',
			fbk: 'deviceTestpatternActive',
		}
	}

	/** An output's Raster Box (Format/AOI centering overlay) changes */
	get testpatternRasterBoxActive():Subscription {
		return {
			pat: 'device/outputList/items/\\w+/pattern/control/pp/centering',
			fbk: 'deviceTestpatternRasterBoxActive',
		}
	}

	/**
	 * Refreshes SelectedLayer.count plus the SelectedLayer.x/.y/.width/.height/.number and
	 * SelectedLayer.Input.Number/.Name/.width/.height variables for whichever layer was selected first
	 * (confirmed live: the device's layerIds array is in Ctrl-click order, not layer number order - the
	 * first entry is whichever layer was Ctrl-clicked first, not necessarily the lowest-numbered one).
	 * Deliberately scoped to only the first of the selection - not a per-layer variable set, which would be
	 * unbounded across many screens/layers - so this stays cheap: it just re-derives "who is selected right
	 * now" and reads that one layer's already locally-synced state (no live device query). Shared by
	 * selectedLayerRect (fires on position/size change), selectedLayerSelectionChange (selection changes),
	 * globalAnchorPointChange (anchor point changes) and selectedLayerSourceChange/
	 * selectedLayerSourceSignalChange (source reassigned or its signal changes), so the variables can't go
	 * stale from any of those.
	 */
	private refreshSelectedLayerRect = (): boolean => {
		const selectedLayers = this.instance.choices.getSelectedLayers()
		this.instance.setVariableValues({ 'SelectedLayer.count': selectedLayers.length })
		const layer = selectedLayers[0]
		if (layer && layer.layerKey.match(/^\d+$/)) {
			const screeninfo = this.instance.choices.getScreenInfo(layer.screenAuxKey)
			const presetKey = this.instance.choices.getPreset(screeninfo.id, this.instance.choices.getPresetSelection('sel'))
			const path = [
				...(screeninfo.isAux ? this.constants.auxPath : this.constants.screenPath),
				'items', screeninfo.platformId,
				'presetList', 'items', presetKey,
				...this.instance.choices.getLayerPath(layer.layerKey),
			]
			const sizeH = this.instance.state.get(['DEVICE', ...path, ...this.constants.propsSizePath, 'sizeH'])
			const sizeV = this.instance.state.get(['DEVICE', ...path, ...this.constants.propsSizePath, 'sizeV'])
			if (sizeH !== undefined && sizeV !== undefined) {
				const posH = this.instance.state.get(['DEVICE', ...path, ...this.constants.propsPositionPath, 'posH']) ?? 0
				const posV = this.instance.state.get(['DEVICE', ...path, ...this.constants.propsPositionPath, 'posV']) ?? 0
				const anchor = this.instance.choices.getGlobalAnchorPoint()
				const anchorPos = anchor === 'CENTER' ? { x: posH, y: posV } : this.instance.choices.convertAnchorPosition(posH, posV, sizeH, sizeV, 'CENTER', anchor)
				const source = this.instance.choices.getLayerSourceInfo(path)
				this.instance.setVariableValues({
					'SelectedLayer.x': anchorPos.x,
					'SelectedLayer.y': anchorPos.y,
					'SelectedLayer.width': sizeH,
					'SelectedLayer.height': sizeV,
					'SelectedLayer.number': layer.layerKey,
					'SelectedLayer.Input.Number': source.number,
					'SelectedLayer.Input.Name': source.name,
					'SelectedLayer.Input.width': source.width,
					'SelectedLayer.Input.height': source.height,
				})
				return false
			}
		}
		// nothing selected, or the selected "layer" is the background/NATIVE layer, which has no position/size
		this.instance.setVariableValues({
			'SelectedLayer.x': '',
			'SelectedLayer.y': '',
			'SelectedLayer.width': '',
			'SelectedLayer.height': '',
			'SelectedLayer.number': '',
			'SelectedLayer.Input.Number': '',
			'SelectedLayer.Input.Name': '',
			'SelectedLayer.Input.width': '',
			'SelectedLayer.Input.height': '',
		})
		return false
	}

	get selectedLayerRect():Subscription {
		return {
			pat: 'device/(auxiliaryScreen|screen|auxiliary)List/items/(S|A)?(\\d{1,3})/presetList/items/(\\w+)/l(iveL)?ayerList/items/(\\d{1,3}|NATIVE)/(position|size)',
			fun: this.refreshSelectedLayerRect,
		}
	}

	/** Selected layer changes - refreshes SelectedLayer.x/.y/.width/.height/.number and SelectedLayer.Input.*, see refreshSelectedLayerRect */
	get selectedLayerSelectionChange():Subscription {
		return {
			pat: 'live/screens/layerSelection/layerIds',
			fun: this.refreshSelectedLayerRect,
		}
	}

	/** The globally selected Anchor Point changes (from this module, WebRCS, or another client) */
	get globalAnchorPointChange():Subscription {
		return {
			pat: 'live/screens/layers/anchorPoint',
			fbk: 'globalAnchorPoint',
			fun: this.refreshSelectedLayerRect,
		}
	}

	/** A layer's assigned source changes (new input/still picked) - refreshes SelectedLayer.Input.*, see refreshSelectedLayerRect */
	get selectedLayerSourceChange():Subscription {
		return {
			pat: 'device/(auxiliaryScreen|screen|auxiliary)List/items/(S|A)?(\\d{1,3})/presetList/items/(\\w+)/l(iveL)?ayerList/items/(\\d{1,3}|NATIVE)/source/pp/inputNum',
			fun: this.refreshSelectedLayerRect,
		}
	}

	/** A live input's detected signal resolution changes - refreshes SelectedLayer.Input.width/.height
	 * if that input happens to be the selected layer's source, see refreshSelectedLayerRect */
	get selectedLayerSourceSignalChange():Subscription {
		return {
			pat: 'device/inputList/items/(\\w+)/plugList/items/(\\w+)/status/signal/pp/image(Width|Height)',
			fun: this.refreshSelectedLayerRect,
		}
	}

	/**
	 * Refreshes the SelectedScreen.number/.numberOfLayers variables for whichever screen/aux is currently
	 * selected (the first one, if several are). Same "just the selection, not an unbounded per-screen set"
	 * scoping as refreshSelectedLayerRect above - layer count per screen is effectively static (a device
	 * config property, not something that changes live during a show), so this only needs to run when the
	 * screen selection itself changes.
	 */
	get selectedScreenChange():Subscription {
		return {
			pat: 'live/screens/screenAuxSelection',
			fun: () => {
				const screenId = this.instance.choices.getSelectedScreens()[0]
				if (screenId) {
					this.instance.setVariableValues({
						'SelectedScreen.number': screenId,
						'SelectedScreen.numberOfLayers': this.instance.choices.getLayerChoices(screenId, false).length,
					})
				} else {
					this.instance.setVariableValues({
						'SelectedScreen.number': '',
						'SelectedScreen.numberOfLayers': '',
					})
				}
				return false
			},
		}
	}

	/** The selected preset (program or preview) changes */
	get selectedPreset():Subscription {
		return {
			pat: '/live/screens/presetModeSelection/presetMode',
			fbk: ['livePresetSelection', 'remoteLayerSelection'],
			fun: (path, _value) => {
				if (this.instance.state.syncSelection) {
					this.instance.setVariableValues({
						selectedPreset: this.instance.state.get(path) === 'PREVIEW' ? 'PVW' : 'PGM'
					})
				}
				return false
			},
		}
	}

	/** Freeze status of an input changes */
	get inputFreeze():Subscription {
		return {
			pat: 'device/inputList/items/(\\w+?)/control/pp/freeze',
			fbk: 'deviceInputFreeze',
		}
	}

	/** Timer state changes */
	get timerState():Subscription {
		return {
			pat: 'DEVICE/device/timerList/items/TIMER_(\\d)/status/pp/state',
			fbk: 'timerState',
			ini: Array.from( {length: this.constants.maxTimers}, (_, i) => (i + 1).toString() ),
			fun: (path, _value) => {
				if (!path) return false
				const timer = path.toString().match(/(?<=TIMER_)(\d)\//) || ['0', '0']
				const varId = this.varName(`timer${timer[1]}_status`, `TIMER${timer[1]}.status`)
				this.instance.addVariable({ id: 'timerState', variableId: varId, name: `Status of Timer ${timer[1]}` })
				this.instance.setVariableValues({[varId]:  this.instance.state.get(path)})
				return false
			},
		}
	}

	/** Screen memory gets renamed */
	get screenMemoryLabel():Subscription {
		return {
			pat: 'DEVICE/device/presetBank/bankList/items/(\\d{1,4})/control/pp/label',
			ini: Array.from({ length: this.constants.maxScreenMemories }, (_, i) => (i + 1).toString()),
			fun: (path, _value) => {
				if (!path) return false
				const memory = Array.isArray(path) ? path[5] : path.split('/')[5]
				const label = memory.toString() !== '0' ? this.instance.state.get(path) : ''
				const screens = this.instance.choices.getChosenScreenAuxes('all')

				const varId = this.varName(`screenMemory${memory}label`, `SM${memory}.label`)
				if (this.instance.state.get(path.toString().replace('control/pp/label', 'status/pp/isValid'))) {
					this.instance.addVariable({ id: 'screenMemoryLabel', variableId: varId, name: `Label of Screen Memory ${memory}` })
				}
				this.instance.setVariableValues({[varId]:  label})

				for (const screen of screens) {
					const pgmmem = this.instance.state.get([
						'DEVICE',
						'device',
						'screenList', 'items', screen,
						'presetList', 'items', this.instance.state.get('LOCAL/screens/' + screen + '/pgm/preset'),
						'presetId','status','pp','id'
					])
					if (memory == pgmmem) {
						const pgmVarId = this.varName(`screen${screen}memoryLabelPGM`, `${screen}.pgm.memory.label`)
						this.instance.addVariable({ id: 'screenMemoryLabel', variableId: pgmVarId, name: `Label of memory in Program for ${screen}` })
						this.instance.setVariableValues({[pgmVarId]:  label})
					}
					const pvwmem = this.instance.state.get([
						'DEVICE',
						'device',
						'screenList', 'items', screen,
						'presetList', 'items', this.instance.state.get('LOCAL/screens/' + screen + '/pvw/preset'),
						'presetId','status','pp','id'
					])
					if (memory == pvwmem) {
						const pvwVarId = this.varName(`screen${screen}memoryLabelPVW`, `${screen}.pvw.memory.label`)
						this.instance.addVariable({ id: 'screenMemoryLabel', variableId: pvwVarId, name: `Label of memory in Preview for ${screen}` })
						this.instance.setVariableValues({[pvwVarId]:  label})
					}
				}
				return true
			},
		}
	}

	/** Last used master memory changes */
	get masterMemory():Subscription {
		return {
			pat: 'DEVICE/device/masterPresetBank/status/lastUsed/presetModeList/items/(PROGRAM|PREVIEW)/pp/memoryId',
			ini: ['PROGRAM', 'PREVIEW'],
			fbk: 'deviceMasterMemory',
		}
	}

	/** Master memory gets renamed */
	get masterMemoryLabel():Subscription {
		return {
			pat: 'DEVICE/device/masterPresetBank/bankList/items/(\\d+)/control/pp/label',
			ini: Array.from({ length: this.constants.maxMasterMemories }, (_, i) => (i + 1).toString()),
			fun: (path, _value) => {
				if (!path) return false
				const memory = Array.isArray(path) ? path[5] : path.split('/')[5]
				const varId = this.varName(`masterMemory${memory}label`, `MM${memory}.label`)
				if (this.instance.state.get(path.toString().replace('control/pp/label', 'status/pp/isValid'))) {
					this.instance.addVariable({ id: 'masterMemoryLabel', variableId: varId, name: `Label of Master Memory ${memory}` })
				}
				this.instance.setVariableValues({[varId]:  this.instance.state.get(path)})
				return true
			},
		}
	}

	/** Multiviewer memory gets renamed */
	get multiviewerMemoryLabel():Subscription {
		return {
			pat: 'DEVICE/device/monitoringBank/bankList/items/(\\d+)/control/pp/label',
			ini: Array.from({ length: this.constants.maxMultiviewerMemories }, (_, i) => (i + 1).toString()),
			fun: (path, _value) => {
				if (!path) return false
				const memory = Array.isArray(path) ? path[5] : path.split('/')[5]
				const varId = this.varName(`multiviewerMemory${memory}label`, `MV${memory}.label`)
				if (this.instance.state.get(path.toString().replace('control/pp/label', 'status/pp/isValid'))) {
					this.instance.addVariable({ id: 'multiviewerMemoryLabel', variableId: varId, name: `Label of Multiviewer Memory ${memory}` })
				}
				this.instance.setVariableValues({[varId]:  this.instance.state.get(path)})
				return true
			},
		}
	}

	/** Layer memory gets renamed */
	get layerMemoryLabel():Subscription {
		return {
			pat: 'DEVICE/device/layerBank/bankList/items/(\\d+)/control/pp/label',
			ini: Array.from({ length: 50 }, (_, i) => (i + 1).toString()),
			fun: (path, _value) => {
				if (!path) return false
				const memory = Array.isArray(path) ? path[5] : path.split('/')[5]
				const varId = this.varName(`layerMemory${memory}label`, `LM${memory}.label`)
				if (this.instance.state.get(path.toString().replace('control/pp/label', 'status/pp/isValid'))) {
					this.instance.addVariable({ id: 'layerMemoryLabel', variableId: varId, name: `Label of Layer Memory ${memory}` })
				}
				this.instance.setVariableValues({[varId]:  this.instance.state.get(path)})
				return true
			},
		}
	}

	/** Still gets renamed */
	get stillLabel():Subscription {
		return {
			pat: 'DEVICE/device/stillList/items/(\\d+)/control/pp/label',
			ini: Array.from({ length: this.constants.maxStills }, (_, i) => (i + 1).toString()),
			fun: (path, _value) => {
				if (!path) return false
				const input = Array.isArray(path) ? path[4] : path.split('/')[4]
				const varId = this.varName(`STILL_${input}label`, `STILL${input}.label`)
				if (this.instance.state.get(path.toString().replace('control/pp/label', 'status/pp/isValid'))) {
					this.instance.addVariable({ id: 'stillLabel', variableId: varId, name: `Label of Still ${input}` })
				}
				this.instance.setVariableValues({[varId]:  this.instance.state.get(path)})
				return true
			},
		}
	}

	/** A still slot gets filled with an image or cleared */
	get stillValid():Subscription {
		return {
			pat: 'DEVICE/device/stillList/items/(\\d+)/status/pp/isValid',
			fun: (_path?: string | string[], _value?: string | string[] | number | boolean): boolean => {
				return true
			},
		}
	}

	/** An image in the Image Library gets added, replaced or removed - triggers a rebuild of the "assign image" action's choices */
	get stillLibraryChange():Subscription {
		return {
			pat: `${this.constants.stillLibraryPath}/items/(\\d+)/status/pp/isValid`,
			fun: (_path?: string | string[], _value?: string | string[] | number | boolean): boolean => {
				return true
			},
		}
	}

	/** Screen gets renamed */
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

	/** Auxscreen gets renamed */
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

	/** Screen gets enabled or disabled */
	get screenEnabled():Subscription {
		return {
			pat: 'device/(?:screen|auxiliaryScreen|auxiliary)List/items/([AS]?\\d{1,3})/status/pp/mode',
			fun: (_path?: string | string[], _value?: string | string[] | number | boolean): boolean => {
				return true
			},
		}
	}

	/** Input gets enabled or disabled */
	get liveInputsChange():Subscription {
		return {
			pat: 'DEVICE/device/inputList/items/IN_(\\d{1,2})/status/pp/isEnabled',
			fun: (_path?: string | string[], _value?: string | string[] | number | boolean): boolean => {
				return true
			},
		}
	}

	/** A master memory gets added or removed */
	get masterMemoriesChange():Subscription {
		return {
			pat: 'DEVICE/device/masterPresetBank/bankList/items/(\\d{1,3})/status/pp/isValid',
			fun: (_path?: string | string[], _value?: string | string[] | number | boolean): boolean => {
				return true
			},
		}
	}

	/** A screen memory gets added or removed */
	get screenMemoriesChange():Subscription {
		return {
			pat: 'DEVICE/device/presetBank/bankList/items/(\\d{1,4})/status/pp/isValid',
			fun: (_path?: string | string[], _value?: string | string[] | number | boolean): boolean => {
				return true
			},
		}
	}

	/** A layer memory gets added or removed */
	get layerMemoriesChange():Subscription {
		return {
			pat: 'DEVICE/device/layerBank/bankList/items/(\\d{1,3})/status/pp/isValid',
			fun: (_path?: string | string[], _value?: string | string[] | number | boolean): boolean => {
				return true
			},
		}
	}

	/** A multiviewer memory gets added or removed */
	get multiviewerMemoriesChange():Subscription {
		return {
			pat: 'DEVICE/device/monitoringBank/bankList/items/(\\d{1,3})/status/pp/isValid',
			fun: (_path?: string | string[], _value?: string | string[] | number | boolean): boolean => {
				return true
			},
		}
	}

	/** A layer gets added or removed */
	get layerCountChange():Subscription {
		return {
			pat: 'DEVICE/device/screenList/items/((?:S|A)\\d{1,2})/status/pp/layerCount',
			fun: (_path?: string | string[], _value?: string | string[] | number | boolean): boolean => {
				return true
			},
		}
	}

	/** The color of a memory gets changed */
	get memoryColorChange():Subscription {
		return {
			pat: 'banks/(\\w+)/items/(\\d+)/color',
			fun: (_path?: string | string[], _value?: string | string[] | number | boolean): boolean => {
				return true
			},
		}
	}

	/** The label of an input gets changed */
	get inputLabel():Subscription {
		return {
			pat: 'DEVICE/device/inputList/items/IN_(\\d+)/control/pp/label',
			ini: Array.from({ length: this.constants.maxInputs }, (_, i) => (i + 1).toString()),
			fun: (path, _value) => {
				if (!path) return false;
				const input = Array.isArray(path) ? path[4] : path.split('/')[4];
				const num = input.replace(/^\w+_/, '')
				const varId = this.varName(`INPUT_${num}label`, `IN${num}.label`)
				if (this.instance.choices.getLiveInputArray().some(inp => inp.id === input)) {
					this.instance.addVariable({ id: 'inputLabel', variableId: varId, name: `Label of Input ${input}` })
				}
				this.instance.setVariableValues({ [varId]: this.instance.state.get(path) });
				return true;
			},
		}
	}

	/**
	 * A screen or auxscreen's canvas resolution changes. Registers S{n}.width/height and A{n}.width/height
	 * module variables (used to build V3 position/size expressions) and keeps their values live.
	 */
	get screenSize():Subscription {
		const pathForProp = (isAux: boolean, platformId: string, prop: 'sizeH' | 'sizeV') => [
			'DEVICE',
			...(isAux ? this.constants.auxPath : this.constants.screenPath),
			'items', platformId,
			...this.constants.screenSizePath,
			prop,
		].join('/')

		return {
			pat: [...this.constants.screenSizePath, 'size(H|V)'].join('/'),
			ini: () => {
				this.instance.removeVariable('screenSize')
				const paths: string[] = []
				for (const scr of [...this.instance.choices.getScreensArray(), ...this.instance.choices.getAuxArray()]) {
					const info = this.instance.choices.getScreenInfo(scr.id)
					const kind = info.isAux ? 'Auxscreen' : 'Screen'
					this.instance.addVariable({ id: 'screenSize', variableId: `${info.id}.width`, name: `Width of ${kind} ${info.id}` })
					this.instance.addVariable({ id: 'screenSize', variableId: `${info.id}.height`, name: `Height of ${kind} ${info.id}` })
					paths.push(pathForProp(info.isAux, info.platformId, 'sizeH'))
					paths.push(pathForProp(info.isAux, info.platformId, 'sizeV'))
				}
				return paths
			},
			fun: (path) => {
				if (!path || typeof path !== 'string') return false
				for (const scr of [...this.instance.choices.getScreensArray(), ...this.instance.choices.getAuxArray()]) {
					const info = this.instance.choices.getScreenInfo(scr.id)
					if (path === pathForProp(info.isAux, info.platformId, 'sizeH')) {
						this.instance.setVariableValues({ [`${info.id}.width`]: this.instance.state.get(path) })
						return false
					}
					if (path === pathForProp(info.isAux, info.platformId, 'sizeV')) {
						this.instance.setVariableValues({ [`${info.id}.height`]: this.instance.state.get(path) })
						return false
					}
				}
				return false
			},
		}
	}

	/**
	 * A physical output's resolution, refresh rate, or format changes. Registers out{n}.width/height/refreshrate/
	 * format/formatkind/aspectratio module variables (for the outputs that actually exist / are available) and
	 * keeps their values live. Deliberately excludes the raw AWJ totalH/totalV fields (full video timing
	 * including blanking, e.g. 2200x1125 for a 1920x1080@60Hz signal per the CEA-861 standard) - a real but
	 * broadcast-engineering-only value with no use case in Companion button/feedback logic.
	 */
	get outputStatus():Subscription {
		const pathFor = (item: string, prop: string) => `DEVICE/device/outputList/items/${item}/status/pp/${prop}`
		const props: [string, string][] = [
			['sizeH', 'width'],
			['sizeV', 'height'],
			['rate', 'refreshrate'],
			['format', 'format'],
			['formatKind', 'formatkind'],
			['aspectRatio', 'aspectratio'],
		]

		return {
			pat: `device/outputList/items/(\\w+)/status/pp/(?:${props.map(([p]) => p).join('|')})`,
			ini: () => {
				this.instance.removeVariable('outputStatus')
				const items: string[] = this.instance.state.get('DEVICE/device/outputList/itemKeys') ?? []
				const paths: string[] = []
				for (const item of items) {
					if (this.instance.choices.getMultiviewerOutputListKeys().includes(item)) continue // multiviewer outputs get their own MV{n}.* variables, see multiviewerOutputStatus
					if (!this.instance.state.get(pathFor(item, 'isAvailable'))) continue
					for (const [, varProp] of props) {
						this.instance.addVariable({ id: 'outputStatus', variableId: `OUT${item}.${varProp}`, name: `${varProp} of Output ${item}` })
					}
					paths.push(...props.map(([awjProp]) => pathFor(item, awjProp)))
				}
				return paths
			},
			fun: (path) => {
				if (!path || typeof path !== 'string') return false
				const match = path.match(new RegExp(`outputList/items/(\\w+)/status/pp/(${props.map(([p]) => p).join('|')})`))
				if (!match) return false
				const [, item, awjProp] = match
				if (this.instance.choices.getMultiviewerOutputListKeys().includes(item)) return false
				if (!this.instance.state.get(pathFor(item, 'isAvailable'))) return false
				const varProp = props.find(([p]) => p === awjProp)?.[1]
				if (!varProp) return false
				if (awjProp === 'rate') {
					const rate = this.instance.state.get(path)
					const hz = this.constants.outputRateInMilliHertz ? rate / 1000 : rate
					this.instance.setVariableValues({ [`OUT${item}.refreshrate`]: Math.round(hz * 100) / 100 })
				} else {
					this.instance.setVariableValues({ [`OUT${item}.${varProp}`]: this.instance.state.get(path) })
				}
				return false
			},
		}
	}

	/** A physical output's label (name) changes. Registers out{n}.label, mirroring screenLabel/auxscreenLabel -
	 *  separate from outputStatus since the label lives under control/pp, not status/pp like the other out{n}.* props. */
	get outputLabel():Subscription {
		const pathFor = (item: string) => `DEVICE/device/outputList/items/${item}/control/pp/label`
		const availablePath = (item: string) => `DEVICE/device/outputList/items/${item}/status/pp/isAvailable`

		return {
			pat: 'device/outputList/items/(\\w+)/control/pp/label',
			ini: () => {
				this.instance.removeVariable('outputLabel')
				const items: string[] = this.instance.state.get('DEVICE/device/outputList/itemKeys') ?? []
				const paths: string[] = []
				for (const item of items) {
					if (this.instance.choices.getMultiviewerOutputListKeys().includes(item)) continue
					if (!this.instance.state.get(availablePath(item))) continue
					this.instance.addVariable({ id: 'outputLabel', variableId: `OUT${item}.label`, name: `Label of Output ${item}` })
					paths.push(pathFor(item))
				}
				return paths
			},
			fun: (path) => {
				if (!path || typeof path !== 'string') return false
				const match = path.match(/outputList\/items\/(\w+)\/control\/pp\/label/)
				if (!match) return false
				const item = match[1]
				if (this.instance.choices.getMultiviewerOutputListKeys().includes(item)) return false
				if (!this.instance.state.get(availablePath(item))) return false
				this.instance.setVariableValues({ [`OUT${item}.label`]: this.instance.state.get(path) })
				return false
			},
		}
	}

	/**
	 * A physical output's plug (connector) status changes. Registers out{n}.hdcp/colorspace/sinkdetected/
	 * sinkname module variables (for the outputs that actually exist / are available) and keeps them live.
	 * "Sink" is the correct AV/HDMI term for whatever is on the receiving end (monitor, projector, LED wall, ...).
	 */
	get outputPlugStatus():Subscription {
		const outputAvailablePath = (item: string) => `DEVICE/device/outputList/items/${item}/status/pp/isAvailable`
		const pathFor = (item: string, prop: string) => `DEVICE/device/outputList/items/${item}/plugList/items/1/status/pp/${prop}`
		const props: [string, string][] = [
			['isHdcp', 'hdcp'],
			['colorSpace', 'colorspace'],
			['isMonitorDetected', 'sinkdetected'],
			['monitorName', 'sinkname'],
		]

		return {
			pat: `device/outputList/items/(\\w+)/plugList/items/1/status/pp/(?:${props.map(([p]) => p).join('|')})`,
			ini: () => {
				this.instance.removeVariable('outputPlugStatus')
				const items: string[] = this.instance.state.get('DEVICE/device/outputList/itemKeys') ?? []
				const paths: string[] = []
				for (const item of items) {
					if (this.instance.choices.getMultiviewerOutputListKeys().includes(item)) continue // multiviewer outputs are not "physical outputs", see multiviewerOutputStatus
					if (!this.instance.state.get(outputAvailablePath(item))) continue
					for (const [, varProp] of props) {
						this.instance.addVariable({ id: 'outputPlugStatus', variableId: `OUT${item}.${varProp}`, name: `${varProp} of Output ${item}` })
					}
					paths.push(...props.map(([awjProp]) => pathFor(item, awjProp)))
				}
				return paths
			},
			fun: (path) => {
				if (!path || typeof path !== 'string') return false
				const match = path.match(new RegExp(`outputList/items/(\\w+)/plugList/items/1/status/pp/(${props.map(([p]) => p).join('|')})`))
				if (!match) return false
				const [, item, awjProp] = match
				if (this.instance.choices.getMultiviewerOutputListKeys().includes(item)) return false
				if (!this.instance.state.get(outputAvailablePath(item))) return false
				const varProp = props.find(([p]) => p === awjProp)?.[1]
				if (!varProp) return false
				this.instance.setVariableValues({ [`OUT${item}.${varProp}`]: this.instance.state.get(path) })
				return false
			},
		}
	}

	/**
	 * A multiviewer's own output signal (resolution, format, refresh rate, ...). Registers MV{n}.width/height/
	 * refreshrate/format/formatkind/aspectratio variables (one set per multiviewer that
	 * actually exists, via the existing cross-platform getMultiviewerArray()/getMultiviewerOutputPath()
	 * abstraction) and keeps them live. Named "MV{n}.*" - same property names as the physical out{n}.* variables,
	 * "MV" matching the abbreviation Analog Way's own naming already uses elsewhere (see the "VM"->"MV" preset
	 * rename). Aquilon (base) sources this from its own device/monitoringList; Midra's override of
	 * getMultiviewerOutputPath() points this at the same device/outputList "MTVW" entry that outputStatus/
	 * outputPlugStatus now deliberately exclude, so a given multiviewer's data always ends up under MV{n}.*
	 * only, consistently across platforms, instead of sometimes also under an out{n}.* alias.
	 */
	get multiviewerOutputStatus():Subscription {
		const props: [string, string][] = [
			['sizeH', 'width'],
			['sizeV', 'height'],
			['rate', 'refreshrate'],
			['format', 'format'],
			['formatKind', 'formatkind'],
			['aspectRatio', 'aspectratio'],
		]
		const pathFor = (id: string, prop: string) => ['DEVICE', ...this.instance.choices.getMultiviewerOutputPath(id), 'status', 'pp', prop].join('/')

		return {
			pat: `(?:monitoringList|outputList)/items/\\w+/status/pp/(?:${props.map(([p]) => p).join('|')})`,
			ini: () => {
				this.instance.removeVariable('multiviewerOutputStatus')
				const paths: string[] = []
				for (const id of this.instance.choices.getMultiviewerArray()) {
					for (const [, varProp] of props) {
						this.instance.addVariable({ id: 'multiviewerOutputStatus', variableId: `MV${id}.${varProp}`, name: `${varProp} of Multiviewer ${id}` })
					}
					paths.push(...props.map(([awjProp]) => pathFor(id, awjProp)))
				}
				return paths
			},
			fun: (path) => {
				if (!path || typeof path !== 'string') return false
				for (const id of this.instance.choices.getMultiviewerArray()) {
					for (const [awjProp, varProp] of props) {
						if (path !== pathFor(id, awjProp)) continue
						if (awjProp === 'rate') {
							const rate = this.instance.state.get(path)
							const hz = this.constants.outputRateInMilliHertz ? rate / 1000 : rate
							this.instance.setVariableValues({ [`MV${id}.refreshrate`]: Math.round(hz * 100) / 100 })
						} else {
							this.instance.setVariableValues({ [`MV${id}.${varProp}`]: this.instance.state.get(path) })
						}
						return false
					}
				}
				return false
			},
		}
	}

	/**
	 * Generic device identity: model series (product family, e.g. "Midra 4K"), model (specific product, e.g.
	 * "Eikos 4k"), and device name (the user-configurable device label). Series/model are static per connection
	 * (set once by connection.ts on connect - they can't change without a reconnect, which re-runs this anyway);
	 * name is live, since a device can be relabeled without reconnecting.
	 */
	get deviceIdentity():Subscription {
		const labelPathFor = (deviceListPrefix: string) => `DEVICE/device/system/${deviceListPrefix}pp/label`

		return {
			pat: 'device/system/(?:deviceList/items/\\d+/)?pp/label',
			ini: () => {
				this.instance.removeVariable('deviceIdentity')
				this.instance.addVariable({ id: 'deviceIdentity', variableId: 'Device.Series', name: 'Device model series' })
				this.instance.addVariable({ id: 'deviceIdentity', variableId: 'Device.Model', name: 'Device model' })
				this.instance.addVariable({ id: 'deviceIdentity', variableId: 'Device.Name', name: 'Device name (label)' })
				this.instance.addVariable({ id: 'deviceIdentity', variableId: 'Device.FirmwareVersion', name: 'Device firmware version' })
				this.instance.addVariable({ id: 'deviceIdentity', variableId: 'Device.FirmwareGeneration', name: 'Device firmware generation (e.g. V4)' })

				const labelPath = this.instance.state.get(labelPathFor('')) !== undefined ? labelPathFor('') : labelPathFor('deviceList/items/1/')
				return ['LOCAL/deviceModel', 'LOCAL/deviceSeries', 'LOCAL/deviceFirmwareVersion', 'LOCAL/deviceFirmwareGeneration', labelPath]
			},
			fun: (path) => {
				if (!path || typeof path !== 'string') return false
				if (path === 'LOCAL/deviceModel') {
					this.instance.setVariableValues({ 'Device.Model': this.instance.state.get(path) ?? '' })
				} else if (path === 'LOCAL/deviceSeries') {
					this.instance.setVariableValues({ 'Device.Series': this.instance.state.get(path) ?? '' })
				} else if (path === 'LOCAL/deviceFirmwareVersion') {
					this.instance.setVariableValues({ 'Device.FirmwareVersion': this.instance.state.get(path) ?? '' })
				} else if (path === 'LOCAL/deviceFirmwareGeneration') {
					this.instance.setVariableValues({ 'Device.FirmwareGeneration': this.instance.state.get(path) ?? '' })
				} else {
					this.instance.setVariableValues({ 'Device.Name': this.instance.state.get(path) ?? '' })
				}
				return false
			},
		}
	}

	/** Real installed input/output counts (Device.NumberOfInputs/.NumberOfOutputs), useful for Companion project
	 *  logic that needs to know how much I/O a connected device actually has. Recomputed (not just re-read) on
	 *  every relevant isAvailable change, since it's a live count, not a fixed per-platform maximum. */
	get deviceIOCount():Subscription {
		const countInputs = () => this.instance.choices.getLiveInputArray().length
		const countOutputs = () => this.instance.choices.getOutputArray().filter((o) => !this.instance.choices.getMultiviewerOutputListKeys().includes(o.id)).length

		return {
			pat: 'device/(?:inputList|outputList)/items/\\w+/status/pp/isAvailable',
			ini: () => {
				this.instance.removeVariable('deviceIOCount')
				this.instance.addVariable({ id: 'deviceIOCount', variableId: 'Device.NumberOfInputs', name: 'Number of real installed inputs' })
				this.instance.addVariable({ id: 'deviceIOCount', variableId: 'Device.NumberOfOutputs', name: 'Number of real installed outputs' })
				this.instance.setVariableValues({ 'Device.NumberOfInputs': countInputs(), 'Device.NumberOfOutputs': countOutputs() })
				return []
			},
			fun: () => {
				this.instance.setVariableValues({ 'Device.NumberOfInputs': countInputs(), 'Device.NumberOfOutputs': countOutputs() })
				return false
			},
		}
	}

	/**
	 * Aggregated device health for IF/THEN-style feedback use. Temperature uses the single aggregate alarm the
	 * AWJ protocol already provides (device/system/temperature/device/pp/alarm, e.g. "NONE"/"WARNING"/"ALARM").
	 * There is no equivalent single aggregate for fans - Device.Status.Fans is computed by scanning every "alarm"
	 * boolean anywhere under device/system/fan for a true value, so it adapts to whatever fan sub-lists (case
	 * fans, FPGA fans, ...) a given platform actually has instead of assuming a specific fan layout.
	 */
	get deviceHealth():Subscription {
		const temperaturePathFor = (deviceListPrefix: string) => `DEVICE/device/system/${deviceListPrefix}temperature/device/pp/alarm`
		const fanPathFor = (deviceListPrefix: string) => `DEVICE/device/system/${deviceListPrefix}fan`

		const anyAlarm = (obj: any): boolean => {
			if (obj === null || typeof obj !== 'object') return false
			for (const key in obj) {
				if (key === 'alarm' && obj[key] === true) return true
				if (anyAlarm(obj[key])) return true
			}
			return false
		}

		let deviceListPrefix = ''

		return {
			pat: 'device/system/(?:deviceList/items/\\d+/)?(?:temperature/device/pp/alarm|fan/.*alarm)',
			ini: () => {
				this.instance.removeVariable('deviceHealth')
				this.instance.addVariable({ id: 'deviceHealth', variableId: 'Device.Status.Temperature', name: 'Device temperature alarm status' })
				this.instance.addVariable({ id: 'deviceHealth', variableId: 'Device.Status.Fans', name: 'Device fan alarm status' })

				deviceListPrefix = this.instance.state.get(temperaturePathFor('')) !== undefined ? '' : 'deviceList/items/1/'
				return [temperaturePathFor(deviceListPrefix), fanPathFor(deviceListPrefix)]
			},
			fun: (path) => {
				if (!path || typeof path !== 'string') return false
				if (path.includes('/temperature/')) {
					this.instance.setVariableValues({ 'Device.Status.Temperature': this.instance.state.get(temperaturePathFor(deviceListPrefix)) ?? '' })
				} else {
					this.instance.setVariableValues({ 'Device.Status.Fans': anyAlarm(this.instance.state.get(fanPathFor(deviceListPrefix))) ? 'ALARM' : 'OK' })
				}
				return false
			},
		}
	}

	/** device is shut down */
	get shutdown():Subscription {
		return {
			pat: 'DEVICE/device/system/shutdown/cmd/pp/xRequest',
			fun: (_path?: string | string[], value?: string | string[] | number | boolean): boolean => {
				if (value === 'SHUTDOWN') {
					this.instance.log('info', 'Device has been shut down.');
					this.instance.updateStatus(InstanceStatus.Ok, 'Shut down');
				}
				return false;
			},
		}
	}

	/** Used background set gets changed */
	get backgroundSet():Subscription {
		return {
			pat: 'DEVICE/device/screenList/items/((?:S|A)\\d{1,3})/presetList/items/(A|B)/background/source/pp',
			fbk: 'deviceSourceTally',
		}
	}

	/** Aux memory gets renamed (Midra only) */
	get auxMemoryLabel():Subscription {
		return {
			pat: 'DEVICE/device/preset/auxBank/slotList/items/(\\d+)/control/pp/label',
			ini: Array.from({ length: 200 }, (_, i) => (i + 1).toString()),
			fun: (path, _value) => {
				if (!path) return false;
				const memory = Array.isArray(path) ? path[6] : path.split('/')[6];
				const label = memory.toString() !== '0' ? this.instance.state.get(path) : '';
				const auxMemoryVarId = 'auxMemory' + memory + 'label'
				if (this.instance.state.get(path.toString().replace('control/pp/label', 'status/pp/isValid'))) {
					this.instance.addVariable({ id: 'auxMemoryLabel', variableId: auxMemoryVarId, name: `Label of Aux Memory ${memory}` })
				}
				this.instance.setVariableValues({ [auxMemoryVarId]: label });
				for (const screenId of this.instance.choices.getChosenAuxes('all')) {
					const pgmmem = this.instance.state.get([
						'DEVICE',
						'device',
						'auxiliaryScreenList',
						'items',
						screenId.replace(/\D/g, ''),
						'presetList',
						'items',
						this.instance.state.get('LOCAL/screens/' + screenId + '/pgm/preset'),
						'status',
						'pp',
						'memoryId',
					]);
					if (memory == pgmmem) {
						const pgmVarId = 'screen' + screenId + 'memoryLabelPGM'
						this.instance.addVariable({ id: 'auxMemoryLabel', variableId: pgmVarId, name: `Label of memory in Program for ${screenId}` })
						this.instance.setVariableValues({ [pgmVarId]: label });
					}
					const pvwmem = this.instance.state.get([
						'DEVICE',
						'device',
						'auxiliaryScreenList',
						'items',
						screenId.replace(/\D/g, ''),
						'presetList',
						'items',
						this.instance.state.get('LOCAL/screens/' + screenId + '/pvw/preset'),
						'status',
						'pp',
						'memoryId',
					]);
					if (memory == pvwmem) {
						const pvwVarId = 'screen' + screenId + 'memoryLabelPVW'
						this.instance.addVariable({ id: 'auxMemoryLabel', variableId: pvwVarId, name: `Label of memory in Preview for ${screenId}` })
						this.instance.setVariableValues({ [pvwVarId]: label });
					}
				}
				return true;
			},
		}
	}

	/** The used plug of an input gets changed */
	get plugChange():Subscription {
		return {
			pat: 'DEVICE/device/inputList/items/(\\w+)/status/pp/plug',
			ini: Array.from({ length: 16 }, (_, i) => 'INPUT_' + (i + 1)),
			fun: (path, _value) => {
				if (!path) return false;
				const input = Array.isArray(path) ? path[4] : path.split('/')[4];
				const num = input.replace(/^\w+_/, '')
				const varId = this.varName(`INPUT_${num}label`, `IN${num}.label`)
				if (this.instance.choices.getLiveInputArray().some(inp => inp.id === input)) {
					this.instance.addVariable({ id: 'plugChange', variableId: varId, name: `Label of Input ${input}` })
				}
				this.instance.setVariableValues({
					[varId]: this.instance.state.get([
						'DEVICE', 'device', 'inputList', 'items', input,
						'plugList', 'items', this.instance.state.get(path),
						'control', 'pp', 'label'
					])
				});
				return true;
			}
		}
	}

	/**
	 * Returns a string with the feedback ID if a feedback exists and runs an action if there is a 'fun' property
	 * @param pat The path in the state object to check if a feedback or action exists for, if undefined checks all possible subscriptions
	 * @returns an array containing the ids of feedbacks that need to be checked when a subscription matches. undefined if none
	 */
	checkForAction(pat?: string | string[], value?: any): string[] | undefined {
		// console.log('Checking for action', pat, value);
		const subscriptions = this.subscriptions
		let path: string
		if (pat === undefined) {
			let update = false
			for (const key of Object.keys(subscriptions)) {
				const subscriptionobj = subscriptions[key]
				if (subscriptionobj.fun && typeof subscriptionobj.fun === 'function') {
					update = subscriptionobj.fun()
				}
			}
			if (update) void this.instance.updateInstance()
			return undefined
		} else if (typeof pat === 'string') {
			path = pat
		} else if (Array.isArray(pat)) {
			path = pat.join('/')
		} else {
			return undefined
		}

		const subscriptionlist = Object.keys(subscriptions).filter((key) => {
			const regexp = new RegExp(subscriptions[key].pat)
			if (path.match(regexp)) {
				return true
			}
			return false
		})
		let ret: string[] = []
		subscriptionlist.forEach((subscription) => {
			// console.log('found subscription', subscription)
			const subscriptionobj = subscriptions[subscription]
			if (subscriptionobj.fun && typeof subscriptionobj.fun === 'function') {
				// console.log('found subscription fun')
				if (value) {
					const update = subscriptionobj.fun(path, value)
					if (update) void this.instance.updateInstance()
				} else {
					const update = subscriptionobj.fun(path)
					if (update) void this.instance.updateInstance()
				}
			}
			const fbk = subscriptions?.[subscription]?.fbk
			if (fbk) {
				// console.log('found feedback', fbk)
				if (typeof fbk === 'string') {
					ret.push(fbk)
				} else if (Array.isArray(fbk)) {
					ret.push(...fbk)
				}
			}
		})

		if (ret.length >= 1) {
			return ret
		} else {
			return undefined
		}
	}

	/**
	 * Checks if the subscriptions has some iterable output of the 'ini' property and uses this as the path variable for the function of the 'fun' property.  
	 * This has the same effect as if we would receive an update for all parameters observed by a subscription.  
	 * If any of the subscriptions wants to run updateInstance it will be done at the end
	 * @param subscription specific subscription or all subscriptions if omitted
	 */
	initSubscriptions(subscription?: string): void {
		const subscriptions = this.subscriptions
		let update = false

		const checkSub = (sub: string): boolean => {
			let update = false
			const subscriptionobj = subscriptions[sub]
			let pattern = subscriptionobj.pat
			if (subscriptionobj.fun && typeof subscriptionobj.fun === 'function') {
				if (pattern.indexOf('(') === -1) {
					subscriptionobj.fun(pattern)
				} else {
					if (subscriptionobj.ini && Array.isArray(subscriptionobj.ini)) {
						// if ini is array just replace the the one and only capturing group with all the values of the array and run the fun with all resulting paths
						while (pattern.match(/\([^()]+\)/)) {
							pattern = pattern.replace(/\([^()]+\)/g, '*')
						}
						for (const item of subscriptionobj.ini) {
							const upd = subscriptionobj.fun(pattern.replace('*', item))
							if (upd) update = true
						}
					} else if (subscriptionobj.ini && typeof subscriptionobj.ini === 'function') {
						// if ini is a function run fun with all the paths generated by ini
						subscriptionobj.ini(this.instance).forEach((path: string) => {
							if (subscriptionobj.fun && typeof subscriptionobj.fun === 'function') {
								subscriptionobj.fun(path)
							}
						})
					}

				}
			}
			return update
		}

		if (typeof subscription === 'string') {
			update = checkSub(subscription)

		} else {
			// check all subscriptions
			this.subscriptionList.forEach((sub) => {
				const upd = checkSub(sub)
				if (upd) update = true
			})
		}
		
		if (update) {
			void (async () => {
				try {
					void this.instance.updateInstance()
					this.instance.checkAllFeedbacks()
				} catch (error) {
					this.instance.log('error', 'Cannot update the this.instance. '+ error)
				}
			})()
		}
	}

}

