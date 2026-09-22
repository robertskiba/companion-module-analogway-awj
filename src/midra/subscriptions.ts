import {AWJinstance} from '../index.js'
import { Subscription } from '../../types/Subscription.js'
import { InstanceStatus } from '@companion-module/base'
import Subscriptions from '../awjdevice/subscriptions.js'
import { deciSecondsToString } from '../util.js'

/**
 * Class for managing and checking of the subscriptions.
 * A subscription is data of the device associated with a json path in the device model which we are interested in and need to react on changes.
 */
export default class SubscriptionsMidra extends Subscriptions {

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
		// 'globalAnchorPointChange', // Midra has no global anchor point at all - its REMOTE snapshot has no
		// live/screens/layers node, and positions are always stored relative to the centre (a fullscreen
		// 1920x1080 layer reads 960/540). The feedback could only ever report CENTER, for a setting the
		// device does not have. The Layer Properties actions keep their own anchor option, which is a
		// module-side coordinate conversion and works here regardless.
		'selectedLayerSourceChange',
		'selectedLayerSourceSignalChange',
		'selectedLayerOpacityChange',
		'selectedLayerCroppingChange',
		'layerPropertyStatusChange',
		'layerSourceStatusChange',
		// 'layerCutFillSourceStatusChange', // Aquilon only for now - matches deviceLayerCutFillV3's own registration
		'inputKeyingStatusChange',
		'selectedScreenChange',
		'hotBackupSelectionChange',
		'selectedScreenTbarChange',
		'selectedScreenTransitionTimeChange',
		// Backup does not exist on Midra/Alta - see the matching comment in midra/actions.ts.
		// 'backupSetChange',
		// 'backupBackgroundSetChange',
		// 'backupGroupChange',
		// 'backupPrimarySignalChange',
		'widgetSelection',
		'screenLock',
		'sourceVisibility',
		'testpatternActive',
		'selectedPreset',
		'inputFreeze',
		'timerState',
		// 'gpioOut',
		// 'gpioIn',
		'screenTransitionTime',
		'auxScreenTransitionTime',
		'screenMemoryLabel',
		'masterMemory',
		'masterMemoryLabel',
		'multiviewerMemoryLabel',
		// 'layerMemoryLabel',
		'stillLabel',
		'stillValid',
		'screenLabel',
		'auxscreenLabel',
		'screenEnabled',
		// 'liveInputsChange',
		'masterMemoriesChange',
		'screenMemoriesChange',
		// 'layerMemoriesChange',
		'multiviewerMemoriesChange',
		'layerCountChange',
		'memoryColorChange',
		// LivePremier
		// 'presetToggle',
		// 'screenPreset',
		'screenMemoryModifiedChange',
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
		// Midra
		'presetToggle',
		'backgroundSet',
		'screenMemoryChange',
		// 'screenMemoryLabel',
		// 'screenMemoryModifiedChange',
		'auxMemoryLabel',
		'plugChange',
		// 'inputLabel',
		'auxMemoriesChange',
		'liveLayerFreeze',
		'backgroundLayerFreeze',
		'screenFreeze',
		'streamStatus',
		'streamAudioMuteStatus',
		'inputPlugStatus',
		'audioRouteChange',
		'standby',
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

	get screenTransitionTime():Subscription {
		return {
			pat: 'DEVICE/device/transition/screenList/items/(\\d{1,3})/control/pp/takeTime',
			ini: ():string[] => {
				return Array.from({ length: this.constants.maxScreens }, (_, i) => `DEVICE/device/transition/screenList/items/${ i+1 }/control/pp/takeTime`)
			},
			fun: (path, _value) => {
				if (!path) return false
				const screenNumber = Array.isArray(path) ? path[5] : path.split('/')[5]
				const pvwVarId = this.varName(`screenS${screenNumber}timePVW`, `S${screenNumber}.prw.time`)
				const pgmVarId = this.varName(`screenS${screenNumber}timePGM`, `S${screenNumber}.pgm.time`)
				const deciseconds = this.instance.state.get(path)

				if (this.instance.choices.getScreensArray().some(scr => scr.id === 'S' + screenNumber)) {
					this.instance.addVariable({ id: 'screenTransitionTime', variableId: pvwVarId, name: `Transition time for S${screenNumber} PVW` })
					this.instance.addVariable({ id: 'screenTransitionTime', variableId: pgmVarId, name: `Transition time for S${screenNumber} PGM` })
				}
				this.instance.setVariableValues({
					[pvwVarId]: deciSecondsToString(deciseconds),
				})
				this.instance.setVariableValues({
					[pgmVarId]: deciSecondsToString(deciseconds),
				})

				return false
			},
		}
	}

	get auxScreenTransitionTime():Subscription {
		return {
			pat: 'DEVICE/device/transition/auxiliaryScreenList/items/(\\d{1,3})/control/pp/takeTime',
			ini: ():string[] => {
				return Array.from({ length: this.constants.maxAuxScreens }, (_, i) => `DEVICE/device/transition/auxiliaryScreenList/items/${ i+1 }/control/pp/takeTime`)
			},
			fun: (path, _value) => {
				if (!path) return false
				const screenNumber = Array.isArray(path) ? path[5] : path.split('/')[5]
				const pvwVarId = this.varName(`screenA${screenNumber}timePVW`, `A${screenNumber}.prw.time`)
				const pgmVarId = this.varName(`screenA${screenNumber}timePGM`, `A${screenNumber}.pgm.time`)
				const deciseconds = this.instance.state.get(path)

				if (this.instance.choices.getAuxArray().some(scr => scr.id === 'A' + screenNumber)) {
					this.instance.addVariable({ id: 'auxScreenTransitionTime', variableId: pvwVarId, name: `Transition time for A${screenNumber} PVW` })
					this.instance.addVariable({ id: 'auxScreenTransitionTime', variableId: pgmVarId, name: `Transition time for A${screenNumber} PGM` })
				}
				this.instance.setVariableValues({
					[pvwVarId]: deciSecondsToString(deciseconds),
				})
				this.instance.setVariableValues({
					[pgmVarId]: deciSecondsToString(deciseconds),
				})

				return false
			},
		}
	}

	get screenMemoryLabel():Subscription {
		return {
			pat: 'DEVICE/device/preset/bank/slotList/items/(\\d{1,4})/control/pp/label',
			ini: Array.from({ length: this.constants.maxScreenMemories }, (_, i) => (i + 1).toString()),
			fun: (path, _value) => {
				if (!path) return false
				const memory = Array.isArray(path) ? path[6] : path.split('/')[6] || '0'
				const label = memory.toString() !== '0' ? this.instance.state.get(path) : ''
				const varId = this.varName(`screenMemory${memory}label`, `SM${memory}.label`)
				if (this.instance.state.get(path.toString().replace('control/pp/label', 'status/pp/isValid'))) {
					this.instance.addVariable({ id: 'screenMemoryLabel', variableId: varId, name: `Label of Screen Memory ${memory}` })
				}
				this.instance.setVariableValues({[varId]:  label})

				const screens = this.instance.choices.getChosenScreens('all')

				for (const screen of screens) {
					const pgmmem = this.instance.state.get([
						'DEVICE',
						'device',
						'screenList', 'items', screen.replace(/\D/g, ''),
						'presetList', 'items', this.instance.state.get('LOCAL/screens/' + screen + '/pgm/preset'),
						'status','pp','memoryId'
					])
					if (memory == pgmmem) {
						const pgmVarId = this.varName(`screen${screen}memoryLabelPGM`, `${screen}.pgm.memory.label`)
						this.instance.addVariable({ id: 'screenMemoryLabel', variableId: pgmVarId, name: `Label of memory in Program for ${screen}` })
						this.instance.setVariableValues({[pgmVarId]:  label})
					}
					const pvwmem = this.instance.state.get([
						'DEVICE',
						'device',
						'screenList', 'items', screen.replace(/\D/g, ''),
						'presetList', 'items', this.instance.state.get('LOCAL/screens/' + screen + '/pvw/preset'),
						'status','pp','memoryId'
					])
					if (memory == pvwmem) {
						const pvwVarId = this.varName(`screen${screen}memoryLabelPVW`, `${screen}.prw.memory.label`)
						this.instance.addVariable({ id: 'screenMemoryLabel', variableId: pvwVarId, name: `Label of memory in Preview for ${screen}` })
						this.instance.setVariableValues({[pvwVarId]:  label})
					}
				}
				return true
			},
		}
	}

	get masterMemory():Subscription {
		return {
			pat: 'DEVICE/device/preset/masterBank/status/lastUsed/presetModeList/items/(PROGRAM|PREVIEW)/pp/memoryId',
			ini: ['PROGRAM', 'PREVIEW'],
			fbk: 'deviceMasterMemory',
		}
	}

	get masterMemoryLabel():Subscription {
		return {
			pat: 'DEVICE/device/preset/masterBank/slotList/items/(\\d+)/control/pp/label',
			ini: Array.from({ length: this.constants.maxMasterMemories }, (_, i) => (i + 1).toString()),
			fun: (path, _value) => {
				if (!path) return false
				const memory = Array.isArray(path) ? path[6] : path.split('/')[6]
				const varId = this.varName(`masterMemory${memory}label`, `MM${memory}.label`)
				if (this.instance.state.get(path.toString().replace('control/pp/label', 'status/pp/isValid'))) {
					this.instance.addVariable({ id: 'masterMemoryLabel', variableId: varId, name: `Label of Master Memory ${memory}` })
				}
				this.instance.setVariableValues({[varId]:  this.instance.state.get(path)})
				return true
			},
		}
	}

	get multiviewerMemoryLabel():Subscription {
		return {
			pat: 'DEVICE/device/multiviewer/bankList/items/(\\d+)/control/pp/label',
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

	get stillLabel():Subscription {
		return {
			pat: 'DEVICE/device/stillLibrary/bankList/items/(\\d+)/control/pp/label',
			ini: Array.from({ length: this.constants.maxStills }, (_, i) => (i + 1).toString()),
			fun: (path, _value) => {
				if (!path) return false
				const input = Array.isArray(path) ? path[5] : path.split('/')[5]
				// New-name side renamed STILL{n}.label -> IMG{n}.label per explicit user request, to match this
				// module's own "Image Store"/"Image Library" terminology established today (formatSourceShort's
				// IMGn convention) - the old-name side (useOldVariableNames) is untouched on purpose.
				const varId = this.varName(`STILL_${input}label`, `IMG${input}.label`)
				if (this.instance.state.get(path.toString().replace('control/pp/label', 'status/pp/isValid'))) {
					this.instance.addVariable({ id: 'stillLabel', variableId: varId, name: `Label of Image ${input}` })
				}
				this.instance.setVariableValues({[varId]:  this.instance.state.get(path)})
				return true
			},
		}
	}

	get stillValid():Subscription {
		return {
			pat: 'DEVICE/device/stillLibrary/bankList/items/(\\d+)/status/pp/isValid',
			fun: (_path?: string | string[], _value?: string | string[] | number | boolean): boolean => {
				return true
			},
		}
	}

	get screenLabel():Subscription {
		return {
			pat: 'DEVICE/device/screenList/items/(\\d{1,2})/control/pp/label',
			ini: Array.from({ length: this.constants.maxScreens }, (_, i) => (i + 1).toString()),
			fun: (path, _value) => {
				if (!path) return false
				const input = Array.isArray(path) ? path[4] : path.split('/')[4]
				const label = this.instance.state.get(path)
				const exists = this.instance.choices.getScreensArray().some(scr => scr.id === 'S' + input)
				if (this.instance.config.useOldVariableNames) {
					if (exists) {
						this.instance.addVariable({ id: 'screenLabel', variableId: `SCREEN_${input}label`, name: `Label of Screen S${input}` })
						this.instance.addVariable({ id: 'screenLabel', variableId: `screenS${input}label`, name: `Label of Screen S${input}` })
					}
					this.instance.setVariableValues({['SCREEN_' + input + 'label']: label})
					this.instance.setVariableValues({['screenS' + input + 'label']: label})
				} else {
					if (exists) {
						this.instance.addVariable({ id: 'screenLabel', variableId: `S${input}.label`, name: `Label of Screen S${input}` })
					}
					this.instance.setVariableValues({[`S${input}.label`]: label})
				}
				return true
			},
		}
	}

	get auxscreenLabel():Subscription {
		return {
			pat: 'DEVICE/device/auxiliaryScreenList/items/(\\d{1,2})/control/pp/label',
			ini: Array.from({ length: this.constants.maxAuxScreens }, (_, i) => (i + 1).toString()),
			fun: (path, _value) => {
				if (!path) return false
				const input = Array.isArray(path) ? path[4] : path.split('/')[4]
				const label = this.instance.state.get(path)
				const exists = this.instance.choices.getAuxArray().some(scr => scr.id === 'A' + input)
				if (this.instance.config.useOldVariableNames) {
					if (exists) {
						this.instance.addVariable({ id: 'auxscreenLabel', variableId: `AUXSCREEN_${input}label`, name: `Label of Auxscreen A${input}` })
						this.instance.addVariable({ id: 'auxscreenLabel', variableId: `screenA${input}label`, name: `Label of Auxscreen A${input}` })
					}
					this.instance.setVariableValues({['AUXSCREEN_' + input + 'label']: label})
					this.instance.setVariableValues({['screenA' + input + 'label']: label})
				} else {
					if (exists) {
						this.instance.addVariable({ id: 'auxscreenLabel', variableId: `A${input}.label`, name: `Label of Auxscreen A${input}` })
					}
					this.instance.setVariableValues({[`A${input}.label`]: label})
				}
				return true
			},
		}
	}

	/**
	 * An Aux takes its resolution from the output it feeds (see choices.getScreenCanvasSize()), so the
	 * inherited pattern - which only watches a Screen's own canvas - has to cover the output's size and the
	 * preconfig entry that says which output an Aux is on.
	 */
	get screenSize():Subscription {
		const base = super.screenSize
		return {
			...base,
			pat: `(?:${base.pat}|device/outputList/items/\\d+/status/pp/size(?:H|V)|device/preconfig/status/stateList/items/CURRENT/auxiliaryScreenList/items/\\d+/pp/outputList)`,
		}
	}

	/**
	 * The applied preconfig changed - which Screens and Auxes exist, how many Layers each has, and which
	 * outputs they drive. On an Eikos that is the difference between S1+A1, S1+S2 and a single S1 driving two
	 * outputs, and it can be applied at any time while Companion is connected.
	 *
	 * The inherited subscription watches `.../status/pp/mode` on the screen itself, which is LivePremier's
	 * shape; Midra has no such field and keeps all of this in the currently-applied preconfig tree instead.
	 * The pattern therefore never matched here and nothing reacted at all: a Screen that went away kept its
	 * variables with a frozen value, a Screen that appeared got none, and every Screen/Aux/Layer dropdown in
	 * every action and feedback stayed as it was at connect.
	 *
	 * Matched as the whole CURRENT subtree rather than the two or three fields an Eikos happens to use,
	 * deliberately. The Midra models differ from each other in exactly this area - which configurations they
	 * offer and therefore which fields carry the difference - and this one platform class serves all of them
	 * plus Alta. Live on an Eikos 4K simulator that subtree holds `pp/templateUsed` (MIXER here), a Screen's
	 * `pp/enable`, `pp/layerCount` and `pp/outputList`, an Aux's `pp/mode` and `pp/outputList`, each Screen's
	 * `liveLayerList`, and an `outputList` mapping every output to the Screen/Aux it feeds. Naming the subtree
	 * covers whatever a given model actually moves, at no cost: it only ever changes when someone applies a
	 * preconfig.
	 *
	 * Returning true rebuilds the action, feedback and preset definitions, so every dropdown follows. That
	 * rebuild is the expensive part and a preconfig apply arrives as a burst of patches, so it is debounced
	 * into one run; the variable refreshes are cheap and idempotent and run per patch.
	 */
	get screenEnabled():Subscription {
		return {
			pat: 'DEVICE/device/preconfig/status/stateList/items/CURRENT/',
			fun: (): boolean => {
				this.screenSize.fun?.()
				this.layerVariables.fun?.()
				this.refreshScreenAuxRegistrations()
				this.debounce('preconfigApplied', 1000, () => void this.instance.updateInstance())
				return false
			},
		}
	}

	/**
	 * Which Screen or Aux each output feeds. The inherited subscription reads
	 * `outputList/items/{n}/canvas/status/pp/usedInScreenAux`, which Midra does not have - it only has a
	 * boolean `isUsedInScreen` there, so `OUT{n}.usedin` stayed empty on every Midra.
	 *
	 * The assignment lives in the applied preconfig, and only one direction of it can be trusted. The
	 * output's own `pp/usedOnScreen`/`usedOnAux` look like the answer and are not: live on an Eikos 4K
	 * simulator, outputs 3-6 sit at `mode: DISABLE` while still reporting `usedOnScreen: "1"`, and in the
	 * MIXER template output 2 fed Aux 1 while reporting `usedOnScreen: "2"`. They are stale defaults. The
	 * per-Screen and per-Aux `pp/outputList` arrays are correct in both templates, so this inverts those
	 * instead - and only for Screens and Auxes that are currently enabled, so a retired Screen's leftover
	 * assignment cannot claim an output.
	 */
	private refreshOutputUsedIn(): void {
		const usedBy = new Map<string, string>()
		for (const scr of [...this.instance.choices.getScreensArray(), ...this.instance.choices.getAuxArray()]) {
			const info = this.instance.choices.getScreenInfo(scr.id)
			const outputs = this.instance.state.get([
				'DEVICE', 'device', 'preconfig', 'status', 'stateList', 'items', 'CURRENT',
				info.isAux ? 'auxiliaryScreenList' : 'screenList', 'items', info.platformId, 'pp', 'outputList',
			])
			if (!Array.isArray(outputs)) continue
			for (const output of outputs) usedBy.set(String(output), info.id)
		}

		// Same remove-all-then-re-add shape the inherited subscription's own ini uses, and the same gating:
		// the multiviewer's entry is not a physical output here, and an output slot the hardware does not
		// have gets no variable at all. Both happen in one synchronous pass, so the definition list is
		// republished once.
		this.instance.removeVariable('outputUsedIn')
		const items: string[] = this.instance.state.get('DEVICE/device/outputList/itemKeys') ?? []
		for (const item of items) {
			if (this.instance.choices.getMultiviewerOutputListKeys().includes(item)) continue
			if (!this.instance.state.get(`DEVICE/device/outputList/items/${item}/status/pp/isAvailable`)) continue
			this.instance.addVariable({ id: 'outputUsedIn', variableId: `OUT${item}.usedin`, name: `Screen/Aux using Output ${item}` })
			this.instance.setVariableValues({ [`OUT${item}.usedin`]: usedBy.get(item) ?? '' })
		}
	}

	get outputUsedIn():Subscription {
		return {
			// Matches the preconfig subtree itself rather than being called from screenEnabled, which watches the
			// same subtree: both would then run this on every patch of an apply. isAvailable is a second trigger,
			// since an output slot can appear or disappear without the preconfig moving.
			pat: '(?:DEVICE/device/preconfig/status/stateList/items/CURRENT/|device/outputList/items/\\w+/status/pp/isAvailable)',
			ini: () => {
				this.refreshOutputUsedIn()
				return []
			},
			fun: () => {
				this.refreshOutputUsedIn()
				return false
			},
		}
	}

	/**
	 * Adds or removes the per-Screen/Aux variables whose own subscriptions cannot do it, so they follow the
	 * preconfig the way refreshScreenSize already makes the size variables follow it.
	 *
	 * Those subscriptions only fire when the device reports a new label or a new transition time, and it
	 * reports neither when a Screen is simply switched off - so they register what exists at connect and then
	 * have no occasion to clean up. Switching an Eikos to its MATRIX template, which leaves two Screens and
	 * no Aux at all, left A1.pgm.time and A1.prw.time behind with a frozen value.
	 */
	private refreshScreenAuxRegistrations(): void {
		const live = new Set([
			...this.instance.choices.getScreensArray().map((scr) => scr.id),
			...this.instance.choices.getAuxArray().map((scr) => scr.id),
		])
		const all = [
			...Array.from({ length: this.constants.maxScreens }, (_, i) => ({
				id: `S${i + 1}`, index: i + 1, isAux: false, kind: 'Screen',
				labelGroup: 'screenLabel', timeGroup: 'screenTransitionTime', list: 'screenList',
			})),
			...Array.from({ length: this.constants.maxAuxScreens }, (_, i) => ({
				id: `A${i + 1}`, index: i + 1, isAux: true, kind: 'Auxscreen',
				labelGroup: 'auxscreenLabel', timeGroup: 'auxScreenTransitionTime', list: 'auxiliaryScreenList',
			})),
		]
		for (const entry of all) {
			const pgmVarId = this.varName(`screen${entry.id}timePGM`, `${entry.id}.pgm.time`)
			const prwVarId = this.varName(`screen${entry.id}timePVW`, `${entry.id}.prw.time`)
			if (live.has(entry.id)) {
				const deciseconds = this.instance.state.get(`DEVICE/device/transition/${entry.list}/items/${entry.index}/control/pp/takeTime`)
				this.instance.addVariable({ id: entry.timeGroup, variableId: pgmVarId, name: `Transition time for ${entry.id} PGM` })
				this.instance.addVariable({ id: entry.timeGroup, variableId: prwVarId, name: `Transition time for ${entry.id} PVW` })
				this.instance.setVariableValues({ [pgmVarId]: deciSecondsToString(deciseconds), [prwVarId]: deciSecondsToString(deciseconds) })
			} else {
				this.instance.removeVariable(entry.timeGroup, pgmVarId)
				this.instance.removeVariable(entry.timeGroup, prwVarId)
			}
			// The old-name scheme exposes each label under two names at once, which varName() cannot express,
			// so that side is left to the label subscriptions themselves there.
			if (this.instance.config.useOldVariableNames) continue
			if (live.has(entry.id)) {
				this.instance.addVariable({ id: entry.labelGroup, variableId: `${entry.id}.label`, name: `Label of ${entry.kind} ${entry.id}` })
				this.instance.setVariableValues({ [`${entry.id}.label`]: this.instance.state.get(`DEVICE/device/${entry.list}/items/${entry.index}/control/pp/label`) })
			} else {
				this.instance.removeVariable(entry.labelGroup, `${entry.id}.label`)
			}
		}
	}

	get masterMemoriesChange():Subscription {
		return {
			pat: 'DEVICE/device/preset/masterBank/slotList/items/(\\d{1,3})/status/pp/isValid',
			fun: (_path?: string | string[], _value?: string | string[] | number | boolean): boolean => {
				return true
			},
		}
	}

	get screenMemoriesChange():Subscription {
		return {
			pat: 'DEVICE/device/preset/bank/slotList/items/(\\d{1,4})/status/pp/isValid',
			ini: Array.from({ length: this.constants.maxScreenMemories }, (_, i) => (i + 1).toString()),
			fbk: 'deviceScreenMemorySlotStatus',
			fun: (_path?: string | string[], _value?: string | string[] | number | boolean): boolean => {
				this.instance.setVariableValues({ 'SM.nextavailable': this.instance.choices.getNextAvailableScreenMemorySlot() ?? '' })
				return true
			},
		}
	}

	get multiviewerMemoriesChange():Subscription {
		return {
			pat: 'DEVICE/device/multiviewer/bankList/items/(\\d{1,2})/status/pp/isValid',
			fun: (_path?: string | string[], _value?: string | string[] | number | boolean): boolean => {
				return true
			},
		}
	}

	/** A subset of what screenEnabled above already matches, kept as its own named subscription. It funnels
	 *  into the same debounced rebuild rather than triggering its own immediately, or a preconfig apply -
	 *  which moves both - would rebuild every definition twice. */
	get layerCountChange():Subscription {
		return {
			pat: 'DEVICE/device/preconfig/status/stateList/items/CURRENT/screenList/items/\\d/liveLayerList/items/\\d/pp/mode',
			fun: (_path?: string | string[], _value?: string | string[] | number | boolean): boolean => {
				this.debounce('preconfigApplied', 1000, () => void this.instance.updateInstance())
				return false
			},
		}
	}

	get presetToggle():Subscription {
		return {
			pat: 'device/transition/screenList/items/1/control/pp/enablePresetToggle',
			fbk: 'presetToggle'
		}
	}

	get screenPreset():Subscription {
		return {
			pat: 'DEVICE/device/transition/(auxiliaryS|s)creenList/items/\\d+/status/pp/transition',
			fbk: 'deviceTake',
			ini: () => [
				...this.instance.choices.getScreensArray().map((s) => `DEVICE/device/transition/screenList/items/${s.id.replace(/\D/g, '')}/status/pp/transition`),
				...this.instance.choices.getAuxArray().map((a) => `DEVICE/device/transition/auxiliaryScreenList/items/${a.id.replace(/\D/g, '')}/status/pp/transition`),
			],
		fun: (path, _value) => {
				const setMemoryVariables = (preset: string, variableSuffix: string): void => {
					// An Aux has no memory capability on Midra, so it has no "which memory is loaded" to report -
					// registering the variables anyway would leave three per Aux and preset permanently blank.
					// The Screen memories keep working exactly as before.
					if (prefix === 'A') return
					const newPresetSegment = variableSuffix === 'PVW' ? 'prw' : 'pgm'
					const mem = this.instance.state.get([
						'DEVICE',
						'device',
						...screenpath,
						'presetList', 'items', preset,
						'status', 'pp', 'memoryId',
					])
					const modified = this.instance.state.get([
						'DEVICE',
						'device',
						...screenpath,
						'presetList', 'items', preset,
						'status', 'pp', 'isModified',
					])
					const memVarId = this.varName(`screen${prefix}${screenNum}memory${variableSuffix}`, `${prefix}${screenNum}.${newPresetSegment}.memory.active`)
					const modVarId = this.varName(`screen${prefix}${screenNum}memoryModified${variableSuffix}`, `${prefix}${screenNum}.${newPresetSegment}.memory.modified`)
					this.instance.addVariable({ id: 'screenPreset', variableId: memVarId, name: `Active memory for ${prefix}${screenNum} ${variableSuffix}` })
					this.instance.addVariable({ id: 'screenPreset', variableId: modVarId, name: `Modified flag of active memory for ${prefix}${screenNum} ${variableSuffix}` })
					this.instance.setVariableValues({ [memVarId]: mem ? 'M' + mem : '' });
					this.instance.setVariableValues({ [modVarId]: !!(mem && modified) });
					this.instance.setVariableValues({
						[this.varName(`screen${prefix}${screenNum}memoryLabel${variableSuffix}`, `${prefix}${screenNum}.${newPresetSegment}.memory.label`)]: mem
							? this.instance.state.get(['DEVICE', 'device', 'preset', 'bank', 'slotList', 'items', mem, 'control', 'pp', 'label'])
							: ''
					});
				}

				let patharr: string[];
				if (typeof path === 'string') {
					patharr = path.split('/');
				} else if (Array.isArray(path)) {
					patharr = path;
				} else {
					return false;
				}
				const val = this.instance.state.get(patharr);
				const screenpath = patharr.slice(3,6) // (auxiliaryS|s)creenList/items/\\d+
				const screenNum = patharr[5];
				const prefix = patharr[3].charAt(0).toUpperCase()
				let program = '', preview = ''
				const takeTime = deciSecondsToString(
						this.instance.state.get(['DEVICE', 'device', 'transition', ...screenpath, 'control', 'pp', 'takeTime'])
					)

				if (val === 'AT_UP') {
					program = 'UP' // B
					preview = 'DOWN' // A
					this.instance.state.set(`LOCAL/screens/${prefix}${screenNum}/pgm/preset`, program);
					this.instance.state.set(`LOCAL/screens/${prefix}${screenNum}/pvw/preset`, preview);
					
					this.instance.setVariableValues({ [this.varName(`screen${prefix}${screenNum}timePGM`, `${prefix}${screenNum}.pgm.time`)]: takeTime } )
					this.instance.setVariableValues({ [this.varName(`screen${prefix}${screenNum}timePVW`, `${prefix}${screenNum}.prw.time`)]: takeTime } )

					setMemoryVariables(program, 'PGM');
					setMemoryVariables(preview, 'PVW');
				}
				if (val === 'AT_DOWN') {
					program = 'DOWN' // A
					preview = 'UP' // B
					this.instance.state.set(`LOCAL/screens/${prefix}${screenNum}/pgm/preset`, program);
					this.instance.state.set(`LOCAL/screens/${prefix}${screenNum}/pvw/preset`, preview);

					this.instance.setVariableValues({ [this.varName(`screen${prefix}${screenNum}timePGM`, `${prefix}${screenNum}.pgm.time`)]: takeTime } )
					this.instance.setVariableValues({ [this.varName(`screen${prefix}${screenNum}timePVW`, `${prefix}${screenNum}.prw.time`)]: takeTime } )
					
					setMemoryVariables(program, 'PGM');
					setMemoryVariables(preview, 'PVW');
				}
				this.instance.checkFeedbacks('deviceSourceTally', 'deviceScreenMemory', 'deviceTake');
				return false;
			},
		}
	}

	get backgroundSet():Subscription {
		return {
			pat: 'DEVICE/device/(?:auxiliaryS|s)creenList/items/\\d{1,2}/presetList/items/(?:UP|DOWN)/background/source/pp',
			fbk: 'deviceSourceTally',
		}
	}

	get screenMemoryChange():Subscription {
		return {
			pat: 'DEVICE/device/(s|auxiliaryS)creenList/items/\\d{1,3}/presetList/items/(UP|DOWN)/status/pp/memoryId',
			fbk: ['deviceScreenMemory', 'deviceAuxMemory'],
			fun: (path, value) => {
				if (!path) return false;
				const screenPrefix = (Array.isArray(path) ? path[2] : path.split('/')[2]).charAt(0).toUpperCase()
				const screenNum = Array.isArray(path) ? path[4] : path.split('/')[4];
				const pres = Array.isArray(path) ? path[7] : path.split('/')[7];
				const presname = pres === this.instance.state.get(`LOCAL/screens/${screenPrefix}${screenNum}/pgm/preset`) ? 'PGM' : 'PVW';
				const newPresetSegment = presname === 'PVW' ? 'prw' : 'pgm'
				// An Aux has no memory capability on Midra, so there is no active memory to report and the
				// A{n}.{pgm|prw}.memory.* variables are not registered at all. The subscription itself still
				// fires for an Aux, because the Aux Memory feedbacks listed above depend on it.
				if (screenPrefix === 'A') return false;
				const memorystr = value ? value.toString() : '';
				const memVarId = this.varName(`screen${screenPrefix}${screenNum}memory${presname}`, `${screenPrefix}${screenNum}.${newPresetSegment}.memory.active`)
				this.instance.addVariable({ id: 'screenMemoryChange', variableId: memVarId, name: `Active memory for ${screenPrefix}${screenNum} ${presname}` })
				this.instance.setVariableValues({ [memVarId]: memorystr });
				this.instance.setVariableValues({
					[this.varName(`screen${screenPrefix}${screenNum}memoryLabel${presname}`, `${screenPrefix}${screenNum}.${newPresetSegment}.memory.label`)]: memorystr !== ''
						? this.instance.state.get([
							'DEVICE',
							'device',
							'preset',
							screenPrefix === 'A' ? 'auxBank' : 'bank',
							'slotList',
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
			pat: 'DEVICE/device/(s|auxiliaryS)creenList/items/\\d{1,3}/presetList/items/(UP|DOWN)/status/pp/isModified',
			fbk: ['deviceScreenMemory', 'deviceAuxMemory'],
			fun: (path, _value) => {
				if (!path) return false;
				const screenType = Array.isArray(path) ? path[2] : path.split('/')[2]
				const screenPrefix = screenType.charAt(0).toUpperCase()
				const screenNum = Array.isArray(path) ? path[4] : path.split('/')[4];
				const pres = Array.isArray(path) ? path[7] : path.split('/')[7];
				const presName = pres === this.instance.state.get(`LOCAL/screens/${screenPrefix}${screenNum}/pgm/preset`) ? 'PGM' : 'PVW';
				const newPresetSegment = presName === 'PVW' ? 'prw' : 'pgm'
				// See screenMemoryChange above - an Aux has no memory, so no .memory.modified either.
				if (screenPrefix === 'A') return false;
				const modVarId = this.varName(`screen${screenPrefix}${screenNum}memoryModified${presName}`, `${screenPrefix}${screenNum}.${newPresetSegment}.memory.modified`)
				this.instance.addVariable({ id: 'screenMemoryModifiedChange', variableId: modVarId, name: `Modified flag of active memory for ${screenPrefix}${screenNum} ${presName}` })
				this.instance.setVariableValues({
					[modVarId]: !!(this.instance.state.get(
						[
							'DEVICE','device',
							screenType,'items', screenNum,
							'presetList','items', pres,
							'status','pp','memoryId'
						]
					) && this.instance.state.get(path))
				});
				return false;
			},
		}
	}

	get plugChange(): Subscription {
		return {
			pat: 'DEVICE/device/inputList/items/(\\w+)/status/pp/plug',
			ini: Array.from({ length: this.constants.maxInputs }, (_, i) => 'INPUT_' + (i + 1)),
			fun: (path, _value) => {
				if (!path) return false;
				const input = Array.isArray(path) ? path[4] : path.split('/')[4];
				const num = input.replace(/^\w+_/, '')
				const varId = this.varName(`INPUT_${num}label`, `IN${num}.label`)
				if (this.instance.state.get(['DEVICE', 'device', 'inputList', 'items', input, 'status', 'pp', 'isAvailable'])) {
					this.instance.addVariable({ id: 'plugChange', variableId: varId, name: `Label of Input ${num}` })
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

	get inputLabel(): Subscription {
		return {
			pat: 'DEVICE/device/inputList/items/INPUT_\\d+/plugList/items/\\d+/control/pp/label',
			fun: (path, _value) => {
				if (!path) return false;
				const input = Array.isArray(path) ? path[4] : path.split('/')[4];
				const plug = Array.isArray(path) ? path[7] : path.split('/')[7];
				if (this.instance.state.get([
					'DEVICE', 'device', 'inputList', 'items', input, 'status', 'pp', 'plug'
				]) == plug) {
					const num = input.replace(/^\w+_/, '')
					this.instance.setVariableValues({
						[this.varName(`INPUT_${num}label`, `IN${num}.label`)]: this.instance.state.get(path)
					});
					return true;
				} else {
					return false;
				}
			}
		}
	}

	get auxMemoriesChange(): Subscription {
		return {
			pat: 'DEVICE/device/preset/auxBank/slotList/items/(\\d{1,4})/status/pp/isValid',
			fun: (): boolean => {
				return true;
			},
		}
	}

	get liveLayerFreeze(): Subscription {
		return {
			pat: 'device/screenList/items/\\d{1,2}/liveLayerList/items/(\\d{1,2})/control/pp/freeze',
			fbk: 'deviceLayerFreeze',
			ini: (): string[] => {
				const paths: string[] = [];
				for (let screen = 1; screen <= this.constants.maxScreens; screen += 1) {
					for (let layer = 1; layer <= this.constants.maxLayers; layer += 1) {
						paths.push(`DEVICE/device/screenList/items/${screen}/liveLayerList/items/${layer}/control/pp/freeze`);
					}
				}
				return paths;
			},
			fun: (path, value) => {
				if (!path) return false;
				const screen = Array.isArray(path) ? path[4] : path.split('/')[4];
				const layer = Array.isArray(path) ? path[7] : path.split('/')[7];
				if (value === true) {
					this.instance.setVariableValues({ [`frozen_S${screen}_L${layer}`]: '*' });
				} else if (value === false) {
					this.instance.setVariableValues({ [`frozen_S${screen}_L${layer}`]: ' ' });
				} else if (value === undefined) {
					value = this.instance.state.get(path);
					this.instance.setVariableValues({ [`frozen_S${screen}_L${layer}`]: value === true ? '*' : ' ' });
				} else {
					this.instance.setVariableValues({ [`frozen_S${screen}_L${layer}`]: '-' });
				}
				return false;
			}
		}
	}

	get backgroundLayerFreeze(): Subscription {
		return {
			pat: 'DEVICE/device/screenList/items/(\\d{1,2})/background/control/pp/freeze',
			fbk: 'deviceLayerFreeze',
			ini: Array.from({ length: this.constants.maxScreens }, (_, i) => (i + 1).toString()),
			fun: (path, value) => {
				if (!path) return false;
				const screen = Array.isArray(path) ? path[4] : path.split('/')[4];
				if (value === true) {
					this.instance.setVariableValues({ [`frozen_S${screen}_NATIVE`]: '*' });
				} else if (value === false) {
					this.instance.setVariableValues({ [`frozen_S${screen}_NATIVE`]: ' ' });
				} else if (value === undefined) {
					value = this.instance.state.get(path);
					this.instance.setVariableValues({ [`frozen_S${screen}_NATIVE`]: value === true ? '*' : ' ' });
				} else {
					this.instance.setVariableValues({ [`frozen_S${screen}_NATIVE`]: '-' });
				}
				return false;
			}
		}
	}

	get screenFreeze(): Subscription {
		return {
			pat: 'DEVICE/device/(auxiliaryS|s)creenList/items/\\d{1,2}/control/pp/freeze',
			fbk: 'deviceScreenFreeze',
			ini: () => [
				...Array.from({ length: this.constants.maxScreens },
					(_, i) => `DEVICE/device/screenList/items/${i+1}/control/pp/freeze`),
				...Array.from({ length: this.constants.maxAuxScreens }, 
					(_, i) => `DEVICE/device/auxiliaryScreenList/items/${i+1}/control/pp/freeze`),
			],
			fun: (path, value) => {
				if (!path) return false;
				const prefix = (Array.isArray(path) ? path[2] : path.split('/')[2]).charAt(0).toUpperCase()
				const screenNum = Array.isArray(path) ? path[4] : path.split('/')[4];
				if (value === true) {
					this.instance.setVariableValues({ [`frozen_${prefix}${screenNum}`]: '*' });
				} else if (value === false) {
					this.instance.setVariableValues({ [`frozen_${prefix}${screenNum}`]: ' ' });
				} else if (value === undefined) {
					value = this.instance.state.get(path);
					this.instance.setVariableValues({ [`frozen_${prefix}${screenNum}`]: value === true ? '*' : ' ' });
				} else {
					this.instance.setVariableValues({ [`frozen_${prefix}${screenNum}`]: '-' });
				}
				return false;
			}
		}
	}

	get streamStatus(): Subscription {
		return {
			pat: 'DEVICE/device/streaming/status/pp/mode',
			fbk: 'deviceStreaming'
		}
	}

	get streamAudioMuteStatus(): Subscription {
		return {
			pat: 'DEVICE/device/streaming/control/audio/live/pp/mute',
			fbk: 'deviceStreamAudioMuteStatus'
		}
	}

	get inputPlugStatus(): Subscription {
		return {
			// Midra's real input id is 'INPUT_n' (see plugChange's own 'ini' above / deviceInputFreeze's fix) -
			// 'IN_n' never matches any real path here, so this feedback previously never live-updated, only
			// ever showing its initial value from when the button was placed.
			pat: 'DEVICE/device/inputList/items/INPUT_\\d+/status/pp/plug',
			fbk: 'deviceInputPlugStatus'
		}
	}

	get audioRouteChange(): Subscription {
		return {
			pat: 'DEVICE/device/audio/custom/sourceList/items/\\w+/control/pp/channelMapping',
			fbk: ['deviceAudioRouteChannelsStatus', 'deviceAudioRouteBlockStatus'],
		}
	}

	get standby(): Subscription {
		return {
			pat: 'DEVICE/device/system/shutdown/standby/control/pp/xRequest',
			fun: (_path, value) => {
				if (value === 'STANDBY') {
					this.instance.log('info', 'Device going to standby.');
					this.instance.updateStatus(InstanceStatus.Ok, 'Standby');
				}
				return false;
			},
		}
	}

	get shutdown(): Subscription {
		return {
			pat: 'DEVICE/device/system/shutdown/standby/control/pp/xRequest',
			fun: (_path, value) => {
				if (value === 'SWITCH_OFF') {
					this.instance.log('info', 'Device has been shut down.');
					this.instance.updateStatus(InstanceStatus.Ok, 'Shut down');
				}
				return false;
			},
		}
	}

}

