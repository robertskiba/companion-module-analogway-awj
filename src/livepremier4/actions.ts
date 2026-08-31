import {AWJinstance} from '../index.js'

import {
	CompanionActionContext,
	CompanionActionEvent,
	CompanionInputFieldDropdown,
	SomeCompanionActionInputField,
} from '@companion-module/base'
import { splitRgb } from '@companion-module/base'
import Actions from '../awjdevice/actions.js'
import { parseBoolean } from '../util.js'

/**
 * T = Object like {option1id: type, option2id: type}
 */
type AWJaction<T> = {
	name: string
	description?: string
	tooltip?: string,
	sortName?: string
	options: SomeAWJactionInputfield<T>[]
	callback?: (action: ActionEvent<T>, context: CompanionActionContext) => void
	subscribe?: (action: ActionEvent<T>) => void
	unsubscribe?: (action: ActionEvent<T>) => void
	learn?: (
		action: ActionEvent<T>
	) => Partial<AWJoptionValues<T>> | undefined | Promise<Partial<AWJoptionValues<T>> | undefined>
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

type SomeAWJactionInputfield<T> = { isVisible?: ((options: AWJoptionValues<T>, [string]?: any) => boolean) }
	& DistributiveOmit<SomeCompanionActionInputField, 'isVisible'>

type ActionEvent<T> = Omit<CompanionActionEvent, 'options'> & {
	options: AWJoptionValues<T>
}

type AWJoptionValues<T> = T

export default class ActionsLivepremier4 extends Actions {


	readonly actionsToUse = [
		'deviceScreenMemory',
		'deviceUpdatePreset',
		'deviceSaveScreenMemory',
		// 'deviceAuxMemory',
		'deviceMasterMemory',
		'deviceLayerMemory',
		'deviceLayerMemoryV3',
		'deviceMultiviewerMemory',
		'deviceTakeScreen',
		'deviceCutScreen',
		'deviceTbar',
		'deviceTakeTime',
		'deviceScreenEncoderAdjustV3',
		'deviceInputKeying',
		'deviceInputFreeze',
		// 'deviceLayerFreeze',
		// 'deviceScreenFreeze',
		'deviceAssignImageLibraryToStore',
		'deviceSelectSource',
		'devicePositionSize',
		'deviceSelectSourceV3',
		'devicePositionSizeV3',
		'deviceLayerTransitionsV3',
		'deviceLayerKeyingV3',
		'deviceLayerOpacityV3',
		'deviceLayerAspectCropV3',
		'deviceLayerMaskV3',
		'deviceLayerBorderV3',
		'deviceLayerEffectsV3',
		'deviceLayerSpeedV3',
		'deviceLayerTimingV3',
		'deviceLayerEncoderAdjustV3',
		'deviceSetAnchorPoint',
		'deviceResetLayerSize',
		'deviceCopyProgram',
		'devicePresetToggle',
		'remoteMultiviewerSelectWidget',
		'deviceMultiviewerSource',
		'selectScreen',
		'lockScreen',
		'selectPreset',
		'selectLayer',
		'selectLayerV3',
		'remoteSync',
		// 'deviceStreamControl',
		// 'deviceStreamAudioMute',
		'deviceAudioRouteBlock',
		'deviceAudioRouteChannels',
		'deviceAudioDanteFunctions',
		'deviceTimerSetup',
		'deviceTimerAdjust',
		'deviceTimerTransport',
		'deviceTestpatterns',
		'deviceTestpatternRasterBox',
		'cstawjcmd',
		'cstawjgetcmd',
		'deviceGPO',
		'devicePower',
		'deviceBackupSetSource',
		'deviceBackupAutoMode'
	]
	
	constructor (instance: AWJinstance) {
		super(instance)
		this.instance = instance
		this.init()
	}


	/**
	 * MARK: Take one or multiple screens - LivePremier4
	 *
	 * "Wait for Transition Completion" (2026-08-28) polls screenAuxGroupList/items/{screen}/status/pp/take,
	 * confirmed live to read "OFF" while idle - waits for it to leave "OFF" (transition started) and then
	 * return to "OFF" (transition finished), without needing to know what busy value(s) it takes on meanwhile.
	 * Left unchecked (default), the existing fixed delay() is used instead - see its own doc comment.
	 */
	// "Wait for Transition Completion" deliberately sits OUTSIDE the serialize()-guarded section below - see
	// deviceTakeScreen's own comment for why (a later panic-button Cut on the same screen must never be stuck
	// queued behind a still-running, possibly long transition wait).
	get deviceTakeScreen() {
		const deviceTakeScreen = super.deviceTakeScreen
		deviceTakeScreen.callback = (action) => {
			let dir = ''
			const targetScreens = action.options.screens === 'first'
				? this.choices.getSelectedScreens().slice(0, 1)
				: this.choices.getChosenScreenAuxes(action.options.screens)
			// Only the quick "command sent, receipt confirmed" phase holds the per-screen queue (see
			// AWJinstance.serialize()'s own doc comment on why it's keyed per-screen at all) - the optional,
			// potentially many-seconds-long "Wait for Transition Completion" below happens AFTER releasing it,
			// per explicit user requirement (2026-08-28): a mistaken long Take must still be immediately
			// abortable by a Cut (or any other action) on the same screen, not stuck waiting behind this one.
			const sent = this.instance.serialize(targetScreens, async () => {
				for (const screen of targetScreens) {
					let pgm = this.choices.getPreset(screen, 'pgm')
					if (pgm === 'A') {
						dir = 'xTakeUp'
					} else if (pgm === 'B') {
						dir = 'xTakeDown'
					} else {
						return
					}
					this.connection.sendWSmessage(['device', 'screenAuxGroupList', 'items', screen, 'control', 'pp', dir], true)
				}
				// Confirms receipt only, not full completion - see waitForPulseComplete()'s doc comment for why
				// a fixed delay (not a status poll) is used specifically for Take/Cut.
				await this.delay(200)
			})
			if (!parseBoolean(action.options.waitForComplete)) return sent
			return sent.then(() => Promise.all(targetScreens.map((screen) =>
				this.waitForLevelReturnToRest(['DEVICE', 'device', 'screenAuxGroupList', 'items', screen, 'status', 'pp', 'take'], 'OFF')
			)))
		}
		return deviceTakeScreen
	}

	/**
	 *  MARK: Recall Screen Memory LivePremier4
	 *
	 * Async + awaits confirmation per screen before returning, per explicit user request (2026-08-28): a
	 * following "Take" (or any action reading the newly-loaded state) on the same button/sequence needs the
	 * recall to have actually landed, not just been sent - "man musste früher oft einen wait mechanismus mit
	 * dem wait befehl verwenden, damit irgendwas klappte." Confirmation is a LEVEL check (not the transient
	 * isLoading pulse seen in a live WebRCS recording, which a 50ms poll could miss entirely if the recall
	 * finishes faster than one poll interval) - waits until presetBank/status/presetId/.../pp/id actually
	 * equals the requested memory number, which stays true afterward instead of pulsing back.
	 */
	get deviceScreenMemory(): AWJaction<{ screens: string, preset: string, memory: string, selectScreens: boolean, unlockIfLocked: boolean, relockAfterChange: boolean}> {

		const returnAction  = super.deviceScreenMemory

		returnAction.options[0]['choices'] = [{ id: 'first', label: 'First/Only Selected Screen' }, { id: 'sel', label: 'All Selected Screens' }, ...this.choices.getScreenAuxChoices()]
		returnAction.callback = (action) => {
			const screens = action.options.screens === 'first'
				? this.choices.getSelectedScreens().slice(0, 1)
				: this.choices.getChosenScreenAuxes(action.options.screens)
			return this.instance.serialize(screens, async () => {
			const preset = this.choices.getPresetSelection(action.options.preset, true)
			const unlockedScreens = new Set<string>()
			const waitPromises: Promise<boolean>[] = []
			for (const screen of screens) {
				const listKey = screen.startsWith('A') ? 'auxiliaryList' : 'screenList'
				const path = [
					'device',
					'presetBank',
					'control',
					'load',
					'slotList',
					'items',
					action.options.memory,
					listKey,
					'items',
					screen,
					'presetList',
					'items',
					preset,
					'pp',
					'xRequest',
				]
				if (this.choices.isLocked(screen, preset)) {
					if (!parseBoolean(action.options.unlockIfLocked)) continue
					if (!unlockedScreens.has(screen)) {
						this.choices.setScreenLock(screen, preset, false)
						unlockedScreens.add(screen)
					}
				}

				this.connection.sendWSmessage(path,false, true)
				this.instance.sendXupdate()

				const presetLetter = this.choices.getPreset(screen, action.options.preset)
				const idPath = ['DEVICE', 'device', 'presetBank', 'status', 'presetId', listKey, 'items', screen, 'presetList', 'items', presetLetter, 'pp', 'id']
				waitPromises.push(this.waitForStateValue(idPath, (v) => String(v) === String(action.options.memory)))

				if (parseBoolean(action.options.selectScreens)) {
					if (this.state.syncSelection) {
						this.connection.sendWSdata('REMOTE', 'replace', '/live/screens/screenAuxSelection', [screens])
					} else {
						this.state.set('LOCAL/screenAuxSelection/keys', screens)
						this.instance.checkFeedbacks('liveScreenSelection')
					}
				}
			}
			await Promise.all(waitPromises)
			if (parseBoolean(action.options.relockAfterChange)) {
				for (const screenAuxKey of unlockedScreens) {
					this.choices.setScreenLock(screenAuxKey, preset, true)
				}
			}
			})
		}

		return returnAction
	}

	/**
	 * MARK: Save/Revert Screen Memory Changes - LivePremier4
	 *
	 * Command sequence confirmed live (2026-08-28, 192.168.20.112) via WebRCS action recorder:
	 * - Save:   device/presetBank/control/save/{screenList|auxiliaryList}/items/{screen}/presetList/items/{PROGRAM|PREVIEW}/slotList/items/{slot}/pp/xRequest
	 * - Revert: device/presetBank/control/load/slotList/items/{slot}/{screenList|auxiliaryList}/items/{screen}/presetList/items/{PROGRAM|PREVIEW}/pp/xRequest
	 *   (identical to the plain "Recall Screen Memory" load path above - Revert is just re-loading the
	 *   already-loaded slot, which discards whatever unsaved changes were made since that load)
	 * Both need the currently loaded slot number, read from the A/B-keyed status path (not PROGRAM/PREVIEW):
	 * device/presetBank/status/presetId/{screenList|auxiliaryList}/items/{screen}/presetList/items/{A|B}/pp/id
	 */
	get deviceUpdatePreset(): AWJaction<{ screens: string, preset: string, mode: string, unlockIfLocked: boolean, relockAfterChange: boolean }> {

		const returnAction = super.deviceUpdatePreset

		returnAction.options[0]['choices'] = [{ id: 'first', label: 'First/Only Selected Screen' }, { id: 'sel', label: 'All Selected Screens' }, ...this.choices.getScreenAuxChoices()]
		returnAction.callback = (action) => {
			const screens = action.options.screens === 'first'
				? this.choices.getSelectedScreens().slice(0, 1)
				: action.options.screens === 'sel'
					? this.choices.getSelectedScreens()
					: [action.options.screens]
			return this.instance.serialize(screens, async () => {
			const preset = this.choices.getPresetSelection(action.options.preset, true)
			const unlockedScreens = new Set<string>()
			const waitPromises: Promise<boolean>[] = []
			for (const screen of screens) {
				const listKey = screen.startsWith('A') ? 'auxiliaryList' : 'screenList'
				const presetLetter = this.choices.getPreset(screen, action.options.preset)
				const idPath = ['DEVICE', 'device', 'presetBank', 'status', 'presetId', listKey, 'items', screen, 'presetList', 'items', presetLetter, 'pp', 'id']
				const slot = this.state.get(idPath)
				if (!slot) continue

				if (this.choices.isLocked(screen, preset)) {
					if (!parseBoolean(action.options.unlockIfLocked)) continue
					if (!unlockedScreens.has(screen)) {
						this.choices.setScreenLock(screen, preset, false)
						unlockedScreens.add(screen)
					}
				}

				if (action.options.mode === 'revert') {
					const path = ['device', 'presetBank', 'control', 'load', 'slotList', 'items', String(slot), listKey, 'items', screen, 'presetList', 'items', preset, 'pp', 'xRequest']
					this.connection.sendWSmessage(path, false, true)
					waitPromises.push(this.waitForStateValue(idPath, (v) => String(v) === String(slot)))
				} else {
					const path = ['device', 'presetBank', 'control', 'save', listKey, 'items', screen, 'presetList', 'items', preset, 'slotList', 'items', String(slot), 'pp', 'xRequest']
					this.connection.sendWSmessage(path, false, true)
					const validPath = ['DEVICE', 'device', 'presetBank', 'bankList', 'items', String(slot), 'status', 'pp', 'isValid']
					waitPromises.push(this.waitForStateValue(validPath, (v) => v === true))
				}
				this.instance.sendXupdate()
			}
			await Promise.all(waitPromises)
			if (parseBoolean(action.options.relockAfterChange)) {
				for (const screenAuxKey of unlockedScreens) {
					this.choices.setScreenLock(screenAuxKey, preset, true)
				}
			}
			})
		}

		return returnAction
	}

	/**
	 * MARK: Save Screen Memory to Slot (+ edit label/delete Screen Memory) - LivePremier4
	 *
	 * "Save" reuses the same path confirmed live for "Save/Revert Screen Memory Changes" above, just with the
	 * target slot coming straight from the user's own "Memory" choice instead of the currently-loaded slot -
	 * device/presetBank/control/save/{screenList|auxiliaryList}/items/{screen}/presetList/items/{PROGRAM|PREVIEW}/slotList/items/{slot}/pp/xRequest
	 * "Update Screen Memory Label" and "Delete Screen Memory" both act purely on the memory bank slot itself,
	 * not on any live Screen - confirmed live (192.168.20.112, 2026-08-28) at device/presetBank/bankList/items/
	 * {slot}/control/pp/label (plain string, 32 chars max) and .../control/pp/xDelete (boolean pulse).
	 *
	 * Async + awaits waitForStateValue() before returning, per explicit user request (2026-08-28): "Next
	 * Available" reads getNextAvailableScreenMemorySlot() from our own local state cache, which only reflects
	 * a save/delete once the device's own confirmation has round-tripped back over the websocket. Without
	 * blocking here, a zero-delay loop of many "Save to Next Available" actions on one button (no explicit
	 * wait between them, tested live with a 1000-iteration stress loop) could have several iterations compute
	 * the SAME "next" slot before the first one's confirmation arrives, clobbering each other instead of each
	 * landing in its own distinct slot. Companion runs a plain action list sequentially, awaiting each async
	 * callback before starting the next one (only an explicit "Action Group" runs members in parallel) - so
	 * this is sufficient without the user needing to add manual Wait actions.
	 */
	get deviceSaveScreenMemory(): AWJaction<{ screens: string, preset: string, memory: string, label: string, action: string, allowExisting: boolean }> {

		const returnAction = super.deviceSaveScreenMemory

		// A Screen Memory can only ever hold exactly one Screen/Aux's state, so - unlike Recall/Take/etc. -
		// there is no "sel"/"all" bulk-target choice here, and even an expression resolving to several screens
		// (e.g. "S1S2") only ever uses the first one, per explicit user decision (2026-08-28).
		returnAction.options[0]['choices'] = [{ id: 'first', label: 'First/Only Selected Screen' }, ...this.choices.getScreenAuxChoices()]
		returnAction.callback = (action) => {
			const slot = action.options.memory === 'next' ? this.choices.getNextAvailableScreenMemorySlot() : action.options.memory
			if (!slot) return Promise.resolve()

			// Serialize keyed by the memory slot itself (a shared resource, e.g. two operators racing to save
			// into the same explicit slot number) and, for 'save' specifically, also by the source screen - see
			// AWJinstance.serialize()'s own doc comment for why a screen key must never be a single fixed one.
			// 'delete'/'updateLabel' don't touch any live Screen at all, so only the slot key applies to those.
			const screen = action.options.action === 'save'
				? (action.options.screens === 'first' ? this.choices.getSelectedScreens() : this.choices.getChosenScreenAuxes(action.options.screens))[0]
				: undefined
			const keys = [`SM:${slot}`, ...(screen ? [screen] : [])]

			return this.instance.serialize(keys, async () => {
			const alreadyValid = this.choices.getScreenMemoryArray().some((mem) => mem.id === slot)
			if (alreadyValid && !parseBoolean(action.options.allowExisting)) return

			const bankItemPath = ['device', 'presetBank', 'bankList', 'items', String(slot), 'control', 'pp']
			const bankValidPath = ['DEVICE', 'device', 'presetBank', 'bankList', 'items', String(slot), 'status', 'pp', 'isValid']

			if (action.options.action === 'delete') {
				this.connection.sendWSmessage([...bankItemPath, 'xDelete'], false, true)
				this.instance.sendXupdate()
				await this.waitForStateValue(bankValidPath, (v) => v === false)
				return
			}

			if (action.options.action === 'updateLabel') {
				this.connection.sendWSmessage([...bankItemPath, 'label'], action.options.label)
				this.instance.sendXupdate()
				await this.waitForStateValue(['DEVICE', ...bankItemPath, 'label'], (v) => v === action.options.label)
				return
			}

			// action === 'save' - exactly one target screen, always the first one resolved. Confirmed live
			// (2026-08-28) that saving is NOT blocked by a locked Screen, unlike Recall/Take/etc. - no lock
			// handling here on purpose.
			if (!screen) return
			const preset = this.choices.getPresetSelection(action.options.preset, true)

			const listKey = screen.startsWith('A') ? 'auxiliaryList' : 'screenList'
			const path = ['device', 'presetBank', 'control', 'save', listKey, 'items', screen, 'presetList', 'items', preset, 'slotList', 'items', String(slot), 'pp', 'xRequest']
			this.connection.sendWSmessage(path, false, true)

			// An explicitly typed label always applies, whether overwriting an existing slot or saving into an
			// empty one. Only the auto-generated fallback (device clock - system/rtc, not the Companion host's)
			// is exclusive to still-EMPTY slots - overwriting an existing Screen Memory with an empty Label
			// field keeps its current label untouched instead of blanking/renaming it automatically.
			if (action.options.label !== '') {
				this.connection.sendWSmessage([...bankItemPath, 'label'], action.options.label)
			} else if (!alreadyValid) {
				const pad = (n: number) => String(n).padStart(2, '0')
				const monthAbbrev: Record<string, string> = {
					JANUARY: 'Jan', FEBRUARY: 'Feb', MARCH: 'Mar', APRIL: 'Apr', MAY: 'May', JUNE: 'Jun',
					JULY: 'Jul', AUGUST: 'Aug', SEPTEMBER: 'Sep', OCTOBER: 'Oct', NOVEMBER: 'Nov', DECEMBER: 'Dec',
				}
				const rtcPath = ['DEVICE', 'device', 'system', 'rtc', 'status', 'pp']
				const day = this.state.get([...rtcPath, 'day'])
				const month = monthAbbrev[this.state.get([...rtcPath, 'month'])] ?? '???'
				const hours = this.state.get([...rtcPath, 'hours'])
				const minutes = this.state.get([...rtcPath, 'minutes'])
				const autoLabel = `Saved from ${screen} - ${month} ${day}, ${pad(hours)}:${pad(minutes)}`
				this.connection.sendWSmessage([...bankItemPath, 'label'], autoLabel)
			}
			this.instance.sendXupdate()
			await this.waitForStateValue(bankValidPath, (v) => v === true)
			})
		}

		return returnAction
	}

	/**
	 * MARK: Recall Master Memory - LivePremier4
	 *
	 * Async + awaits the same isLoading pulse used by Recall Screen Memory's own recorder-confirmed structure,
	 * just rooted under masterPresetBank instead of presetBank (confirmed live 2026-08-28: masterPresetBank/
	 * control/load/slotList/items/{memory}/presetList/items/{PROGRAM|PREVIEW}/pp/isLoading exists with the
	 * same shape) - a following action in the same sequence (e.g. Take) should see the fully-loaded state.
	 */
	get deviceMasterMemory() {

		const deviceMasterMemory = super.deviceMasterMemory

		deviceMasterMemory.callback = (action) => {
			const bankpath = ['device', 'masterPresetBank']
			const list = 'bankList'
			const memorypath = ['items', action.options.memory]
			const loadpath = ['control', 'load', 'slotList']

			const filterpath = this.state.get(['DEVICE', ...bankpath, list, ...memorypath, 'status', 'pp', 'isShadow']) ? ['status', 'shadow', 'pp'] : ['status', 'pp']

			const screens = this.state.get([
				'DEVICE',
				...bankpath,
				list,
				...memorypath,
				...filterpath,
				'screenFilter',
			])

			const auxScreens = this.state.get([
				'DEVICE',
				...bankpath,
				list,
				...memorypath,
				...filterpath,
				'auxFilter',
			])

			// serialize() keyed by every screen/aux this Master Memory affects - see its own doc comment for why
			// this must never be a single fixed key: an unrelated screen's action must never wait on this one.
			return this.instance.serialize([...screens, ...auxScreens], async () => {
			const preset = this.choices.getPresetSelection(action.options.preset, true)
			const unlockedScreens = new Set<string>()
			const stillLocked = [...screens, ...auxScreens].filter((screen: string) => {
				if (!this.choices.isLocked(screen, preset)) return false
				if (!parseBoolean(action.options.unlockIfLocked)) return true
				if (!unlockedScreens.has(screen)) {
					this.choices.setScreenLock(screen, preset, false)
					unlockedScreens.add(screen)
				}
				return false
			})
			if (stillLocked.length > 0) {
				return // TODO: resembles original WebRCS behavior, but could be also individual screen handling
			}
			const fullpath = [
				...bankpath,
				...loadpath,
				...memorypath,
				'presetList',
				'items',
				preset,
				'pp',
				'xRequest',
			]
			this.connection.sendWSmessage( fullpath, false, true )
			this.instance.sendXupdate()
			await this.waitForPulseComplete(['DEVICE', ...bankpath, ...loadpath, ...memorypath, 'presetList', 'items', preset, 'pp', 'isLoading'])

			if (action.options.selectScreens) {
				if (this.state.syncSelection) {
					this.connection.sendWSdata('REMOTE', 'replace', '/live/screens/screenAuxSelection', [[...screens, ...auxScreens]])
				} else {
					this.state.set('LOCAL/screenAuxSelection/keys', [...screens, ...auxScreens])
					this.instance.checkFeedbacks('liveScreenSelection')
				}
			}

			if (parseBoolean(action.options.relockAfterChange)) {
				for (const screenAuxKey of unlockedScreens) {
					this.choices.setScreenLock(screenAuxKey, preset, true)
				}
			}
			})
		}

		return deviceMasterMemory
	}

	/**
	 * MARK: Select the source in a layer livepremier4
	 */
	get deviceSelectSource() {
		const deviceSelectSource = super.deviceSelectSource

		deviceSelectSource.callback = (action) => {
			if (action.options.method === 'spec') {
				for (const screen of action.options.screen) {
					if (this.choices.isLocked(screen, action.options.preset)) continue
					for (const layer of action.options[`layer${screen}`]) {
						let sourcetype = 'sourceLayer'
						if (screen.startsWith('A')) {
							sourcetype = 'sourceBack'
						}
						if (layer === 'NATIVE') {
							sourcetype = 'sourceNative'
						}
						this.connection.sendWSmessage([
							'device', 
							screen.startsWith('A') ? 'auxiliaryList' : 'screenList', 
							'items', screen,
							'presetList', 'items', this.choices.getPreset(screen, action.options.preset),
							'layerList', 'items', layer,
							'source', 'pp', 'inputNum'
						], action.options[sourcetype])
					}
				}
			}
			else if (action.options.method === 'sel') {
				const preset = this.choices.getPresetSelection('sel')
				this.choices.getSelectedLayers()
					.filter((selection) => this.choices.isLocked(selection.screenAuxKey, preset) === false)
					.forEach((layer) => {
						let source = 'keep'
						if (
							layer.screenAuxKey.startsWith('S') &&
							layer.layerKey === 'NATIVE' &&
							action.options['sourceNative'] !== 'keep'
						) source = action.options['sourceNative']
						else if (
							layer.screenAuxKey.startsWith('S') &&
							layer.layerKey.match(/^\d+$/) &&
							action.options['sourceLayer'] !== 'keep'
						) source = action.options['sourceLayer']
						else if (
							layer.screenAuxKey.startsWith('A') &&
							layer.layerKey.match(/^\d+$/) &&
							action.options['sourceBack'] !== 'keep'
						) source = action.options['sourceBack']
						if (source !== 'keep'){
							this.connection.sendWSmessage([
								'device',
								layer.screenAuxKey.startsWith('A') ? 'auxiliaryList' : 'screenList', 
								'items', layer.screenAuxKey,
								'presetList', 'items', this.choices.getPreset(layer.screenAuxKey, preset),
								'layerList', 'items', layer.layerKey,
								'source', 'pp', 'inputNum'
							], source)
						}
				})
			}
			this.instance.sendXupdate()
		}

		this.choices.getScreensAuxArray().forEach((screen) => {
			const isScreen = screen.id.startsWith('S')

			deviceSelectSource.options.push({
				id: `layer${screen.id}`,
				type: 'multidropdown',
				label: 'Layer ' + screen.id,
				// frozen deprecated V2 choice list - not sourced from getLayerChoices() anymore, which now
				// emits 'BG' for Background (see the module-wide 'BG' rename) - this action keeps 'NATIVE' forever
				choices: isScreen ? [{ id: 'NATIVE', label: 'Background' }, ...this.choices.getLayerChoices(screen.id, false)] : this.choices.getLayerChoices(screen.id, false),
				default: ['1'],
				isVisibleExpression: `$(options:method) == 'spec' && arrayIncludes($(options:screen), '${screen.id}')`,
				disableAutoExpression: true,
			})
		})
		deviceSelectSource.options.push(
			{
				id: 'sourceLayer',
				type: 'dropdown',
				label: 'Screen Layer Source',
				choices: [{ id: 'keep', label: "Don't change source"}, ...this.choices.getSourceChoices()],
				default: 'keep',
				// TODO(isVisible-migration): original logic hides this field only when method is 'spec' and none of the
				// selected S-prefixed screens have a non-NATIVE (numeric) layer selected in their per-screen layer field.
				// This depends on a dynamic, per-screen set of multidropdown fields (layer<screenId>) that cannot be
				// expressed generically in Companion's expression language. Falling back to always-visible to avoid
				// silently hiding functionality; needs manual review.
				isVisibleExpression: 'true',
				disableAutoExpression: true,
			},
			{
				id: 'sourceNative',
				type: 'dropdown',
				label: 'Screen Background Source',
				choices: [{ id: 'keep', label: "Don't change source"}, ...this.choices.choicesBackgroundSourcesPlusNone],
				default: 'keep',
				// TODO(isVisible-migration): original logic hides this field only when method is 'spec' and none of the
				// selected S-prefixed screens have a NATIVE layer selected in their per-screen layer field. This depends
				// on a dynamic, per-screen set of multidropdown fields (layer<screenId>) that cannot be expressed
				// generically in Companion's expression language. Falling back to always-visible to avoid silently
				// hiding functionality; needs manual review.
				isVisibleExpression: 'true',
				disableAutoExpression: true,
			},
			{
				id: 'sourceBack',
				type: 'dropdown',
				label: 'Aux Layer Source',
				choices: [{ id: 'keep', label: "Don't change source"}, ...this.choices.getAuxSourceChoices()],
				default: 'keep',
				// TODO(isVisible-migration): original logic hides this field only when method is 'spec' and none of the
				// selected A-prefixed screens have a non-NATIVE (numeric) layer selected in their per-screen layer field.
				// This depends on a dynamic, per-screen set of multidropdown fields (layer<screenId>) that cannot be
				// expressed generically in Companion's expression language. Falling back to always-visible to avoid
				// silently hiding functionality; needs manual review.
				isVisibleExpression: 'true',
				disableAutoExpression: true,
			},
		)

		return deviceSelectSource
	}

	/**
	 * MARK: Layer Properties - Source (V3) - LivePremier4
	 */
	get deviceSelectSourceV3() {
		const deviceSelectSourceV3 = super.deviceSelectSourceV3

		const resolveTargets = (opt: {screen: string, layer: string}): {screenAuxKey: string, layerKey: string}[] => {
			const targetScreens = opt.screen === 'first'
				? this.choices.getSelectedScreens().slice(0, 1)
				: opt.screen === 'sel'
					? this.choices.getSelectedScreens()
					// still supports a concatenated multi-selection like "S1A1" via expression, same convention as elsewhere in the module
					: this.choices.getChosenScreenAuxes(opt.screen)
			if (opt.layer === 'first') {
				return this.choices.getSelectedLayers().filter(layer => targetScreens.includes(layer.screenAuxKey)).slice(0, 1)
			}
			if (opt.layer === 'sel') {
				return this.choices.getSelectedLayers().filter(layer => targetScreens.includes(layer.screenAuxKey))
			}
			return targetScreens.map(screenAuxKey => ({screenAuxKey, layerKey: this.choices.normalizeLayerId(opt.layer)}))
		}

		// "Get current values" (Companion's standard blue "Learn" button) - reads the first resolved layer's
		// current source and pins screen/preset/layer to the concrete values it read from.
		deviceSelectSourceV3.learn = (action) => {
			const targets = resolveTargets(action.options)
			if (targets.length === 0) return undefined
			const target = targets[0]

			const preset = this.choices.getPresetSelection()
			const isAux = target.screenAuxKey.startsWith('A')
			const presetpath = [
				'device', isAux ? 'auxiliaryList' : 'screenList', 'items', target.screenAuxKey,
				'presetList', 'items', this.choices.getPreset(target.screenAuxKey, preset),
			]
			const inputNumPath = [...presetpath, 'layerList', 'items', target.layerKey, 'source', 'pp', 'inputNum']
			const raw = this.state.get(['DEVICE', ...inputNumPath])
			if (typeof raw !== 'string') return undefined

			const newoptions: Partial<typeof action.options> = {
				screen: target.screenAuxKey,
				layer: target.layerKey,
				preset,
			}

			const isBackground = target.layerKey === 'NATIVE' || target.layerKey === 'BKG'
			// background layers store just the bare digit ("3"), not "NATIVE_3" - same reverse mapping the
			// callback's own `source.replace(/\D/g, '')` does in the other direction
			newoptions.sourceLayer = (isBackground && /^\d+$/.test(raw)) ? `NATIVE_${raw}` : raw

			if (raw === 'COLOR') {
				const colorpath = [...presetpath, 'layerList', 'items', target.layerKey, 'source', 'color', 'pp']
				const r = this.state.get(['DEVICE', ...colorpath, 'red']) ?? 0
				const g = this.state.get(['DEVICE', ...colorpath, 'green']) ?? 0
				const b = this.state.get(['DEVICE', ...colorpath, 'blue']) ?? 0
				newoptions.sourceColor = (r << 16) + (g << 8) + b
			}

			return newoptions
		}

		deviceSelectSourceV3.callback = (action) => {
			const preset = action.options.preset
			const source = action.options.sourceLayer
			if (source === 'keep') return
			for (const target of resolveTargets(action.options)) {
				let unlockedByUs = false
				if (this.choices.isLocked(target.screenAuxKey, preset)) {
					if (!parseBoolean(action.options.unlockIfLocked)) continue
					this.choices.setScreenLock(target.screenAuxKey, preset, false)
					unlockedByUs = true
				}
				const isAux = target.screenAuxKey.startsWith('A')
				const presetpath = [
					'device', isAux ? 'auxiliaryList' : 'screenList', 'items', target.screenAuxKey,
					'presetList', 'items', this.choices.getPreset(target.screenAuxKey, preset),
				]
				const inputNumPath = [...presetpath, 'layerList', 'items', target.layerKey, 'source', 'pp', 'inputNum']
				const colorpath = [...presetpath, 'layerList', 'items', target.layerKey, 'source', 'color', 'pp']
				const sendColor = (r: number, g: number, b: number) => {
					this.connection.sendWSmessage([...colorpath, 'red'], r)
					this.connection.sendWSmessage([...colorpath, 'green'], g)
					this.connection.sendWSmessage([...colorpath, 'blue'], b)
				}
				const isBackground = target.layerKey === 'NATIVE' || target.layerKey === 'BKG'
				if (isBackground) {
					if (source === 'NONE') {
						this.connection.sendWSmessage(inputNumPath, 'NONE')
						sendColor(0, 0, 0) // "None" always resets the background to black, regardless of the color picker
					} else if (source === 'COLOR') {
						this.connection.sendWSmessage(inputNumPath, 'COLOR')
						const color = Number(action.options.sourceColor)
						sendColor((color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff)
					} else if (/^NATIVE_\d+$/.test(source)) {
						this.connection.sendWSmessage(inputNumPath, source.replace(/\D/g, ''))
					}
					// anything else picked from the shared list isn't valid for a background layer - no-op
				} else {
					this.connection.sendWSmessage(inputNumPath, source)
					if (source === 'COLOR') {
						const color = Number(action.options.sourceColor)
						sendColor((color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff)
					}
				}
				if (unlockedByUs && parseBoolean(action.options.relockAfterChange)) {
					this.choices.setScreenLock(target.screenAuxKey, preset, true)
				}
			}
			this.instance.sendXupdate()
		}

		return deviceSelectSourceV3
	}

	// MARK: Set Preset Toggle - LivePremier4
	get devicePresetToggle() {
		const devicePresetToggle = super.devicePresetToggle

		devicePresetToggle.callback = (act) => {
			const allscreens = this.choices.getScreensAuxArray(true).map(itm => itm.id)
			
			let action = act.options.action
			if (action === 'toggle') {
				if (this.state.get('DEVICE/device/screenAuxGroupList/items/S1/control/pp/copyMode') === false) action = 'off'
				else action = 'on'
			}
			if (action === 'on') allscreens.forEach((screen: string) =>
				this.connection.sendWSmessage(['device','screenAuxGroupList','items', screen ,'control','pp','copyMode'], false))
			if (action === 'off') allscreens.forEach((screen: string) =>
				this.connection.sendWSmessage(['device','screenAuxGroupList','items', screen ,'control','pp','copyMode'], true))
		}

		return devicePresetToggle
	}

	/**
	 * MARK: Select Layer locally or remote
	 */
	get selectLayer() {
		const selectLayer = super.selectLayer

		selectLayer.callback = (action) => {
			let ret: Record<string, string>[] = []
			if (action.options.method?.endsWith('tgl')) {
				if (this.state.syncSelection) {
					ret = this.state.get('REMOTE/live/screens/layerSelection/layerIds')
						.map((layer: Record<string, string>) => {
							if (layer.type === 'SCREEN_LAYER_ID') return {
								screenAuxKey: layer.screenKey,
								layerKey: layer.screenLayerKey
							}
							else if (layer.type === 'AUX_LAYER_ID') return {
								screenAuxKey: layer.auxKey,
								layerKey: layer.auxLayerKey
							}
							else {
								const screenAuxKeyProp = Object.keys(layer).find(key => key.match(/(?<!Layer)Key/))
								const layerKeyProp = Object.keys(layer).find(key => key.match(/LayerKey/))
								if (screenAuxKeyProp && layerKeyProp) {
									return {
										screenAuxKey: layer[screenAuxKeyProp],
										layerKey: layer[layerKeyProp]	
									}
								} else {
									return {}
								}
							}
						})
				} else {
					ret = this.state.get('LOCAL/layerIds')
				}
			}
			let scrs: string[] = []
			if (action.options.method?.startsWith('sel')) {
				scrs = this.choices.getSelectedScreens()
			}
			if (action.options.method?.startsWith('spec')) {
				scrs = action.options.screen
			}
			for (const screen of scrs) {
				let layers: string[] = []
				if (action.options.method?.startsWith('spec')) {
					layers = action.options[`layer${screen}`]
				}
				if (action.options.method?.startsWith('sel')) {
					layers = action.options.layersel
				}
				if (action.options.method?.endsWith('tgl')) {
					for (const layer of layers) {
						if (layer !== 'NATIVE' && isNaN(parseInt(layer))) continue // may be leftover from midra config
						const idx = ret.findIndex((lay) => {
							return lay['screenAuxKey'] === screen && lay['layerKey'].replace('NATIVE', 'BKG') === layer.replace('NATIVE', 'BKG')
						})
						if (idx === -1) {
							ret.push({ screenAuxKey: screen, layerKey: layer })
						} else {
							ret.splice(idx, 1)
						}
					}
				} else {
					for (const layer of layers) {
						if (layer !== 'NATIVE' && isNaN(parseInt(layer))) continue // may be leftover from midra config
						ret.push({ screenAuxKey: screen, layerKey: layer })
					}
				}
			}
			if (this.state.syncSelection) {
				this.connection.sendWSdata('REMOTE', 'replace', '/live/screens/layerSelection',
					[
						ret.map((layer) => {
							if (layer.screenAuxKey.charAt(0) === 'A') {
								return {
									type: 'AUX_LAYER_ID',
									auxKey: layer.screenAuxKey,
									auxLayerKey: layer.layerKey
								}
							} else {
								return {
									type: 'SCREEN_LAYER_ID',
									screenKey: layer.screenAuxKey,
									screenLayerKey: layer.layerKey
								}
							}
						})
					]
				)
			} else {
				this.state.set('LOCAL/layerIds', ret)
				this.instance.checkFeedbacks('remoteLayerSelection')
			}
		}

		return selectLayer
	}

	/**
	 * MARK: Layer Selection (V3) - LivePremier4
	 */
	get selectLayerV3() {
		const selectLayerV3 = super.selectLayerV3

		selectLayerV3.callback = (action) => {
			if (action.options.preset !== 'sel') {
				if (this.state.syncSelection) {
					switch (action.options.preset) {
						case 'pgm':
							this.connection.sendWSdata('REMOTE', 'set', '/live/screens/presetModeSelection', ['PROGRAM'])
							break
						case 'prw':
						case 'pvw':
							this.connection.sendWSdata('REMOTE', 'set', '/live/screens/presetModeSelection', ['PREVIEW'])
							break
						case 'tgl':
							this.connection.sendWSdata('REMOTE', 'toggle', '/live/screens/presetModeSelection', [])
							break
					}
				} else {
					switch (action.options.preset) {
						case 'pgm':
							this.state.set('LOCAL/presetMode', 'PROGRAM')
							this.instance.setVariableValues({ selectedPreset: 'PGM' })
							break
						case 'prw':
						case 'pvw':
							this.state.set('LOCAL/presetMode', 'PREVIEW')
							this.instance.setVariableValues({ selectedPreset: this.config.useOldVariableNames ? 'PVW' : 'PRW' })
							break
						case 'tgl':
							if (this.state.get('LOCAL/presetMode') === 'PREVIEW') {
								this.state.set('LOCAL/presetMode', 'PROGRAM')
								this.instance.setVariableValues({ selectedPreset: 'PGM' })
							} else {
								this.state.set('LOCAL/presetMode', 'PREVIEW')
								this.instance.setVariableValues({ selectedPreset: this.config.useOldVariableNames ? 'PVW' : 'PRW' })
							}
							break
					}
					this.instance.checkFeedbacks('livePresetSelection')
				}
			}

			let ret: Record<string, string>[] = []
			if (action.options.mode !== 'exclusive') {
				if (this.state.syncSelection) {
					ret = this.state.get('REMOTE/live/screens/layerSelection/layerIds')
						.map((layer: Record<string, string>) => {
							if (layer.type === 'SCREEN_LAYER_ID') return {
								screenAuxKey: layer.screenKey,
								layerKey: layer.screenLayerKey
							}
							else if (layer.type === 'AUX_LAYER_ID') return {
								screenAuxKey: layer.auxKey,
								layerKey: layer.auxLayerKey
							}
							else {
								const screenAuxKeyProp = Object.keys(layer).find(key => key.match(/(?<!Layer)Key/))
								const layerKeyProp = Object.keys(layer).find(key => key.match(/LayerKey/))
								if (screenAuxKeyProp && layerKeyProp) {
									return {
										screenAuxKey: layer[screenAuxKeyProp],
										layerKey: layer[layerKeyProp]
									}
								} else {
									return {}
								}
							}
						})
				} else {
					ret = this.state.get('LOCAL/layerIds')
				}
			}
			const screens = action.options.screens === 'first'
				? this.choices.getSelectedScreens().slice(0, 1)
				: this.choices.getChosenScreenAuxes(action.options.screens)
			const layers = this.choices.getChosenLayers(action.options.layers)
			for (const screen of screens) {
				for (const layer of layers) {
					if (layer !== 'NATIVE' && isNaN(parseInt(layer))) continue // may be leftover from midra config
					const idx = ret.findIndex((lay) => {
						return lay['screenAuxKey'] === screen && lay['layerKey'].replace('NATIVE', 'BKG') === layer.replace('NATIVE', 'BKG')
					})
					if (action.options.mode === 'deselect') {
						if (idx !== -1) ret.splice(idx, 1)
					} else if (action.options.mode === 'toggle') {
						if (idx === -1) ret.push({ screenAuxKey: screen, layerKey: layer })
						else ret.splice(idx, 1)
					} else {
						// exclusive or add
						if (idx === -1) ret.push({ screenAuxKey: screen, layerKey: layer })
					}
				}
			}
			if (this.state.syncSelection) {
				this.connection.sendWSdata('REMOTE', 'replace', '/live/screens/layerSelection',
					[
						ret.map((layer) => {
							if (layer.screenAuxKey.charAt(0) === 'A') {
								return {
									type: 'AUX_LAYER_ID',
									auxKey: layer.screenAuxKey,
									auxLayerKey: layer.layerKey
								}
							} else {
								return {
									type: 'SCREEN_LAYER_ID',
									screenKey: layer.screenAuxKey,
									screenLayerKey: layer.layerKey
								}
							}
						})
					]
				)
			} else {
				this.state.set('LOCAL/layerIds', ret)
				this.instance.checkFeedbacks('remoteLayerSelection')
			}
			this.instance.checkFeedbacks('liveScreenSelection', 'remoteLayerSelection')
		}

		return selectLayerV3
	}

	/**
	 *MARK:  Select Multiviewer Widget - LivePremier4
	*/
	get remoteMultiviewerSelectWidget() {
		const remoteMultiviewerSelectWidget = super.remoteMultiviewerSelectWidget

		remoteMultiviewerSelectWidget.callback = (action) => {
			const mvw = action.options.widget?.split(':')[0] ?? '1'
			const widget = action.options.widget?.split(':')[1] ?? '0'
			let widgetSelection: Record<'mocOutputLogicKey' | 'widgetKey', string>[] = []
			if (this.state.syncSelection) {
				widgetSelection = [...(this.state.get('REMOTE/live/multiviewers/widgetSelection/widgetIds') ?? [])]
			} else {
				widgetSelection = [...(this.state.get('LOCAL/widgetSelection/widgetIds') ?? [])]
			}
			const idx = widgetSelection.findIndex((elem) => {
				return elem.widgetKey == widget && elem.mocOutputLogicKey == mvw
			})

			if ((action.options.sel === 'deselect' || action.options.sel === 'toggle') && idx >= 0) {
				widgetSelection.splice(idx, 1)
			} else if ((action.options.sel === 'select' || action.options.sel === 'toggle') && idx < 0) {
				widgetSelection.push({ widgetKey: widget, mocOutputLogicKey: mvw })
			} else if (action.options.sel === 'selectExclusive') {
				widgetSelection = [{ widgetKey: widget, mocOutputLogicKey: mvw }]
			}

			if (this.state.syncSelection) {
				this.connection.sendWSdata('REMOTE', 'replace', '/live/multiviewers/widgetSelection', [widgetSelection])
			} else {
				this.state.set('LOCAL/widgetSelection/widgetIds', widgetSelection)
				this.instance.checkFeedbacks('remoteWidgetSelection')
			}
		}

		return remoteMultiviewerSelectWidget
	}

	/**
	 * MARK: Select the source in a multiviewer widget - Livepremier4
	 */
	get deviceMultiviewerSource() {	
		const deviceMultiviewerSource = super.deviceMultiviewerSource

		deviceMultiviewerSource.callback = (action) => {
			let widgetSelection: Record<'mocOutputLogicKey' | 'widgetKey', string>[] = []
			if (action.options.widget === 'sel') {
				if (this.state.syncSelection) {
					widgetSelection = [...(this.state.get('REMOTE/live/multiviewers/widgetSelection/widgetIds') ?? [])]
				} else {
					widgetSelection = [...(this.state.get('LOCAL/widgetSelection/widgetIds') ?? [])]
				}
			} else {
				widgetSelection = [
					{
						widgetKey: action.options.widget.split(':')[1] ?? '0',
						mocOutputLogicKey: action.options.widget.split(':')[0] ?? '1',
					},
				]
			}
			for (const widget of widgetSelection) {
				this.connection.sendWSmessage(
					[
						'device',
						'monitoringList',
						'items',
						widget.mocOutputLogicKey,
						'layout',
						'widgetList',
						'items',
						widget.widgetKey,
						'control',
						'pp',
						'source',
					],
					action.options.source
				)
			}
		}

		return deviceMultiviewerSource
	}

	/**
	 * MARK: Route audio block - Livepremier4
	 */
	get deviceAudioRouteBlock() {
		type DeviceAudioRouteBlock = {device: number, out1: string, in1: string, out2?: string, in2?: string, out3?: string, in3?: string, out4?: string, in4?: string, blocksize: number}
		const devices =  this.choices.getLinkedDevicesChoices().length
		const audioOutputChoices = Array.from({length: devices}, (_v, i) => {
			return this.choices.getAudioOutputChoices(i + 1)
		})
		const audioInputChoices = Array.from({length: devices}, (_v, i) => {
			return this.choices.getAudioInputChoices(i + 1)
		})

		const deviceAudioRouteBlock: AWJaction<DeviceAudioRouteBlock> = {
			name: 'Audio - Route (Block)',
			sortName: '06 Audio - Route (Block)',
			description: 'Routes a contiguous block of audio input channels to a contiguous block of output channels in one step.',
			options: [
				{
					type: 'dropdown',
					label: 'Device',
					id: 'device',
					choices: this.choices.getLinkedDevicesChoices(),
					default: 1,
					minChoicesForSearch: 3,
					// NOTE: visibility here is a build-time constant (number of linked devices known when the action's
					// options are constructed), not a live option, so it is baked in as a literal 'true'/'false' rather
					// than a dynamic expression. The field itself must stay present (rather than being omitted) because
					// its default value of 1 is relied upon by the callback below even for a single-device setup.
					isVisibleExpression: devices > 1 ? 'true' : 'false',
					disableAutoExpression: true,
				},
				...audioOutputChoices.map((choices, i) => {
					return {
						type: 'dropdown' as const,
						label: 'First Output Channel',
						id: `out${i+1}`,
						choices: choices,
						default: choices[0]?.id,
						minChoicesForSearch: 0,
						isVisibleExpression: `$(options:device) == ${i + 1}`,
						allowInvalidValues: true,
					}
				}),
				...audioInputChoices.map((choices, i) => {
					return {
						type: 'dropdown' as const,
						label: 'First Input Channel',
						id: `in${i+1}`,
						tooltip: 'Via Expression Mode you can also use a format like \'IN1C1\' instead of the raw id.',
						choices: choices,
						default: choices[0]?.id,
						minChoicesForSearch: 0,
						isVisibleExpression: `$(options:device) == ${i + 1}`,
						allowInvalidValues: true,
					}
				}),
				{
					type: 'number',
					label: 'Block Size',
					id: 'blocksize',
					tooltip: 'Capped at 8, and the block is additionally always clamped to end at the latest at the end of the 8-channel output block it starts in (e.g. starting at Output 1 Channel 7 only ever reaches channels 7-8, regardless of this setting) - a safety measure against accidentally spilling into the next output block with a wrong setting. Use a second action for anything beyond that.',
					default: 8,
					min: 1,
					max: 8,
					range: true,
				},
			],
			callback: (action) => {
				const device = action.options.device
				const inValue = this.choices.getChosenAudioInputChannels(action.options[`in${device}`])[0]
				const outstart = audioOutputChoices[device - 1].findIndex((item) => {
					return item.id === action.options[`out${device}`]
				})
				const instart = audioInputChoices[device - 1].findIndex((item) => {
					return item.id === inValue
				})
				if (outstart > -1 && instart > -1) {
					// Never let the block spill past the end of the 8-channel output block it starts in, no
					// matter what Block Size is set to - each output id is 'moduleId:channelNum' (1-8).
					const outChannelNum = parseInt(audioOutputChoices[device - 1][outstart].id.toString().split(':')[1], 10)
					const remainingInOutputBlock = 8 - outChannelNum + 1
					const max = Math.min(
						audioOutputChoices[device - 1].length - outstart,
						audioInputChoices[device - 1].length - instart,
						action.options.blocksize,
						remainingInOutputBlock
					) // since 'None' is input at index 0 no extra test is needed, it is possible to fill all outputs with none
					for (let s = 0; s < max; s += 1) {
						const path = [
							'device','audio','control',
							'deviceList', 'items', device.toString(),
							'txList','items',
							audioOutputChoices[device - 1][outstart + s].id.toString().split(':')[0],
							'channelList','items',
							audioOutputChoices[device - 1][outstart + s].id.toString().split(':')[1],
							'control','pp','source',
						]
						this.connection.sendWSmessage(path, audioInputChoices[device - 1][instart === 0 ? 0 : instart + s].id)
					}
				}
			}
		}

		return deviceAudioRouteBlock
	}

	/**
	 * MARK: Route audio channels - Livepremier4
	 */
	get deviceAudioRouteChannels() {
		type DeviceAudioRouteChannels = {device: number, out1: string, in1: string[], out2?: string, in2?: string[], out3?: string, in3?: string[], out4?: string, in4?: string[]}

		const devices =  this.choices.getLinkedDevicesChoices().length
		const audioOutputChoices = Array.from({length: devices}, (_v, i) => {
			return this.choices.getAudioOutputChoices(i + 1)
		})
		const audioInputChoices = Array.from({length: devices}, (_v, i) => {
			return this.choices.getAudioInputChoices(i + 1)
		})
		
		const deviceAudioRouteChannels: AWJaction<DeviceAudioRouteChannels> = {
			name: 'Audio - Route (Channels)',
			sortName: '06 Audio - Route (Channels)',
			description: 'Routes individual audio input channels to individual output channels, up to four pairs per call.',
			options: [
				{
					type: 'dropdown',
					label: 'Device',
					id: 'device',
					choices: this.choices.getLinkedDevicesChoices(),
					default: 1,
					// NOTE: visibility here is a build-time constant (number of linked devices known when the action's
					// options are constructed), not a live option, so it is baked in as a literal 'true'/'false' rather
					// than a dynamic expression. The field itself must stay present (rather than being omitted) because
					// its default value of 1 is relied upon by the callback below even for a single-device setup.
					isVisibleExpression: devices > 1 ? 'true' : 'false',
					disableAutoExpression: true,
					minChoicesForSearch: 3,
				},
				...audioOutputChoices.map((choices, i) => {
					return {
						type: 'dropdown' as const,
						label: 'First Output Channel',
						id: `out${i+1}`,
						choices: choices,
						default: choices[0]?.id,
						minChoicesForSearch: 0,
						isVisibleExpression: `$(options:device) == ${i + 1}`,
						allowInvalidValues: true,
					}
				}),
				...audioInputChoices.map((choices, i) => {
					return {
						type: 'multidropdown' as const,
						label: 'input channel(s)',
						id: `in${i+1}`,
						tooltip: 'To target several channels at once via Expression Mode, you can use a format like \'IN1C1IN1C2\' instead of the raw array form.',
						choices: choices,
						default: ['NONE'],
						minChoicesForSearch: 0,
						minSelection: 0,
						isVisibleExpression: `$(options:device) == ${i + 1}`,
						allowInvalidValues: true,
					}
				}),
			],
			callback: (action) => {
				const device = action.options.device
				const inChannels = this.choices.getChosenAudioInputChannels(action.options[`in${device}`])
				if (inChannels.length > 0) {
					const outstart = audioOutputChoices[device -1].findIndex((item) => {
						return item.id === action.options[`out${device}`]
					})
					if (outstart > -1) {
						const max = Math.min(audioOutputChoices[device -1].length - outstart, inChannels.length)
						for (let s = 0; s < max; s += 1) {
							const path = [
								'device', 'audio', 'control',
								'deviceList', 'items', device.toString(),
								'txList', 'items', audioOutputChoices[device -1][outstart + s].id.toString().split(':')[0],
								'channelList', 'items', audioOutputChoices[device -1][outstart + s].id.toString().split(':')[1],
								'control',
								'pp',
								'source',
							]
							this.connection.sendWSmessage(path, inChannels[s])
						}
					}
				} else {
					const path = [
						'device', 'audio', 'control',
						'deviceList', 'items', device.toString(),
						'txList', 'items', action.options[`out${device}`].split(':')[0],
						'channelList', 'items', action.options[`out${device}`].split(':')[1],
						'control',
						'pp',
						'source',
					]
					this.connection.sendWSmessage(path, audioInputChoices[device -1][0]?.id)
				}
			}
		}

		return deviceAudioRouteChannels
	}

	/**
	 * MARK: Setup timer - LivePremier4
	 */
	get deviceTimerSetup() {
		const deviceTimerSetup = super.deviceTimerSetup

		deviceTimerSetup.callback = (action) => {
			this.connection.sendWSmessage(
				['device', 'timerList', 'items', action.options.timer, 'control', 'pp', 'type'],
				action.options.type
			)
			if (action.options.type === 'CURRENTTIME') {
				this.connection.sendWSmessage(
					['device', 'timerList', 'items', action.options.timer, 'control', 'pp', 'currentTimeMode'],
					action.options.currentTimeMode
				)
			} else {
				this.connection.sendWSmessage(
					['device', 'timerList', 'items', action.options.timer, 'control', 'pp', 'unitMode'],
					action.options.unitMode
				)
			}
			
			this.connection.sendWSmessage(
				['device', 'timerList', 'items', action.options.timer, 'control', 'background', 'color', 'pp', 'red'],
				splitRgb(action.options.bg_color).r
			)
			this.connection.sendWSmessage(
				['device', 'timerList', 'items', action.options.timer, 'control', 'background', 'color', 'pp', 'green'],
				splitRgb(action.options.bg_color).g
			)
			this.connection.sendWSmessage(
				['device', 'timerList', 'items', action.options.timer, 'control', 'background', 'color', 'pp', 'blue'],
				splitRgb(action.options.bg_color).b
			)
			this.connection.sendWSmessage(
				['device', 'timerList', 'items', action.options.timer, 'control', 'background', 'color', 'pp', 'alpha'],
				Math.round((splitRgb(action.options.bg_color).a ?? 1) * 255)
			)
			this.connection.sendWSmessage(
				['device', 'timerList', 'items', action.options.timer, 'control', 'text', 'color', 'pp', 'red'],
				splitRgb(action.options.fg_color).r
			)
			this.connection.sendWSmessage(
				['device', 'timerList', 'items', action.options.timer, 'control', 'text', 'color', 'pp', 'green'],
				splitRgb(action.options.fg_color).g
			)
			this.connection.sendWSmessage(
				['device', 'timerList', 'items', action.options.timer, 'control', 'text', 'color', 'pp', 'blue'],
				splitRgb(action.options.fg_color).b
			)
			this.connection.sendWSmessage(
				['device', 'timerList', 'items', action.options.timer, 'control', 'text', 'color', 'pp', 'alpha'],
				Math.round((splitRgb(action.options.fg_color).a ?? 1) * 255)
			)
		}

		return deviceTimerSetup
	}

	/**
	 * MARK: Set input keying
	 */
	get deviceInputKeying() {		
		const deviceInputKeying = super.deviceInputKeying
		
		deviceInputKeying.options[1] = {
			id: 'mode',
			type: 'dropdown',
			label: 'Mode',
			choices: [
				{ id: 'DISABLE', label: 'Keying Disabled' },
				{ id: 'CHROMA', label: 'Chroma Key' },
				{ id: 'LUMA', label: 'Luma Key' },
				{ id: 'CREMATTE3D', label: 'CremaTTe 3D' },
				{ id: 'CUT_AND_FILL', label: 'Cut and Fill' },
			],
			default: 'DISABLE',
		}

		return deviceInputKeying
	}

	/**
	 * MARK: Choose Testpatterns - LivePremier4
	 */
	get deviceTestpatterns() {
		
		const deviceTestpatternsOptions: CompanionInputFieldDropdown[] = [
			{
				id: 'group',
				type: 'dropdown',
				label: 'Group',
				choices: [
					{ id: 'all', label: 'All active Testpatterns' },
					{ id: 'screenList', label: 'Screen Canvas' },
					{ id: 'outputList', label: 'Output or Output Group' },
					{ id: 'inputList', label: 'Input Group' },
				],
				default: 'outputList',
				disableAutoExpression: true,
			},
			{
				id: 'screenList',
				type: 'dropdown',
				label: 'Screen',
				// Live-confirmed on the LivePremier4 simulator: screenList item keys ARE "S1"-style (unlike
				// Midra, which uses plain numeric keys) - getScreenChoices() is correct here.
				choices: this.choices.getScreenChoices(),
				default: this.choices.getScreenChoices()[0]?.id,
				isVisibleExpression: "$(options:group) == 'screenList'",
			},
			{
				id: 'outputList',
				type: 'dropdown',
				label: 'Output',
				choices: this.choices.getOutputChoices(),
				default: this.choices.getOutputChoices()[0]?.id,
				isVisibleExpression: "$(options:group) == 'outputList'",
			},
			{
				id: 'inputList',
				type: 'dropdown',
				label: 'Input',
				choices: this.choices.getLiveInputChoices(),
				default: this.choices.getLiveInputChoices()[0]?.id,
				isVisibleExpression: "$(options:group) == 'inputList'",
			},
			{
				id: 'patall',
				type: 'dropdown',
				label: 'Pattern',
				choices: [{ id: '0', label: 'Disable all active Testpatterns' }],
				default: '0',
				isVisibleExpression: "$(options:group) == 'all'",
			},
			{
				id: 'screenListPat',
				type: 'dropdown',
				label: 'Pattern',
				choices: [
					{ id: 'NONE', label: 'Off' },
					{ id: 'GEOMETRIC', label: 'Geometric' },
					{ id: 'VERTICAL_GREY_SCALE', label: 'Vertical Greyscale' },
					{ id: 'HORIZONTAL_GREY_SCALE', label: 'Horizontal Greyscale' },
					{ id: 'HORIZONTAL_GREY_SCALE_2', label: 'Horizontal Greysteps' },
					{ id: 'VERTICAL_COLOR_BAR', label: 'Vertical Colorbars' },
					{ id: 'HORIZONTAL_COLOR_BAR', label: 'Horizontal Colorbars' },
					{ id: 'GRID_CUSTOM', label: 'Grid Custom' },
					{ id: 'SMPTE', label: 'SMPTE' },
					{ id: 'VERTICAL_GRADIENT', label: 'Vertical Gradient' },
					{ id: 'HORIZONTAL_GRADIENT', label: 'Horzontal Gradient' },
					{ id: 'CROSSHATCH', label: 'Crosshatch' },
					{ id: 'CHECKERBOARD', label: 'Checkerboard' },
					{ id: 'THIRTY_BPP_1', label: '30 Bit per Pixel 1' },
					{ id: 'THIRTY_BPP_2', label: '30 Bit per Pixel 2' },
				],
				default: 'NONE',
				isVisibleExpression: "$(options:group) == 'screenList'",
			},
			{
				id: 'inputListPat',
				type: 'dropdown',
				label: 'Pattern',
				choices: [
					{ id: 'NO_PATTERN', label: 'Off' },
					{ id: 'COLOR', label: 'Solid Color' },
					{ id: 'VERTICAL_GREY_SCALE', label: 'Vertical Greyscale' },
					{ id: 'HORIZONTAL_GREY_SCALE', label: 'Horizontal Greyscale' },
					{ id: 'VERTICAL_COLOR_BAR', label: 'Vertical Colorbars' },
					{ id: 'HORIZONTAL_COLOR_BAR', label: 'Horizontal Colorbars' },
					{ id: 'GRID_16_16', label: 'Grid 16x16' },
					{ id: 'GRID_32_32', label: 'Grid 32x32' },
					{ id: 'GRID_CUSTOM', label: 'Grid Custom' },
					{ id: 'SMPTE', label: 'SMPTE' },
					{ id: 'BURST_H', label: 'Horizontal Burst' },
					{ id: 'BURST_V', label: 'Vertical Burst' },
					{ id: 'VERTICAL_GRADIENT', label: 'Vertical Gradient' },
					{ id: 'HORIZONTAL_GRADIENT', label: 'Horzontal Gradient' },
					{ id: 'CROSSHATCH', label: 'Crosshatch' },
					{ id: 'CHECKERBOARD', label: 'Checkerboard' },
					{ id: 'MOVING', label: 'Moving Lines' },
					{ id: 'ID', label: 'ID' },
				],
				default: 'NO_PATTERN',
				isVisibleExpression: "$(options:group) == 'inputList'",
			},
			{
				id: 'outputListPat',
				type: 'dropdown',
				label: 'Pattern',
				choices: [
					{ id: 'NO_PATTERN', label: 'Off' },
					{ id: 'COLOR', label: 'Solid Color' },
					{ id: 'VERTICAL_GREY_SCALE', label: 'Vertical Greyscale' },
					{ id: 'HORIZONTAL_GREY_SCALE_1', label: 'Horizontal Greyscale' },
					{ id: 'HORIZONTAL_GREY_SCALE_2', label: 'Horizontal Greysteps' },
					{ id: 'VERTICAL_COLOR_BAR', label: 'Vertical Colorbars' },
					{ id: 'HORIZONTAL_COLOR_BAR', label: 'Horizontal Colorbars' },
					{ id: 'GRID_16_16', label: 'Grid 16x16' },
					{ id: 'GRID_32_32', label: 'Grid 32x32' },
					{ id: 'GRID_CUSTOM', label: 'Grid Custom' },
					{ id: 'SMPTE', label: 'SMPTE' },
					{ id: 'BURST_H', label: 'Horizontal Burst' },
					{ id: 'BURST_V', label: 'Vertical Burst' },
					{ id: 'VERTICAL_GRADIENT', label: 'Vertical Gradient' },
					{ id: 'HORIZONTAL_GRADIENT', label: 'Horzontal Gradient' },
					{ id: 'CROSSHATCH', label: 'Crosshatch' },
					{ id: 'CHECKERBOARD', label: 'Checkerboard' },
					{ id: 'MOVING', label: 'Moving Lines' },
					{ id: 'ID', label: 'ID' },
					{ id: 'SOFTEDGE', label: 'Softedge' },
					{ id: 'STEREOSCOPY', label: '3D' },
				],
				default: 'NO_PATTERN',
				isVisibleExpression: "$(options:group) == 'outputList'",
				disableAutoExpression: true,
			},
		]

		return this.deviceTestpatterns_common(deviceTestpatternsOptions, 'Device - Set LivePremier Testpattern')

	}

	/**
	 * MARK: Testpattern Raster Box - LivePremier4
	 */
	get deviceTestpatternRasterBox() {
		return this.deviceTestpatternRasterBox_common('Device - Set LivePremier Testpattern Raster Box')
	}

	/**
	 * MARK: Adjust GPO
	 * Livepremier 4
	 */
	get deviceGPO() {
		type DeviceGPO = {gpo: number, action: number}

		let tooltip: string|undefined = undefined
		if (this.choices.getLinkedDevicesChoices().length) {
			tooltip = 'GPO number 1-8 for device #1'
			for (let device = 1; device < this.choices.getLinkedDevicesChoices().length; device+=1) {
				tooltip += `, ${device*8 +1}-${device*8 +8} for device #${device+1}`
			}
		} 
		
		const deviceGPO: AWJaction<DeviceGPO> = {
			name: 'Device - Set GPO',
			sortName: '08 Device - Set GPO',
			description: 'Turns a General Purpose Output (GPO) on, off, or toggles it.',
			options: [
				{
					id: 'gpo',
					type: 'number',
					label: 'GPO',
					min: 1,
					max: this.choices.getLinkedDevicesChoices().length * 8,
					range: true,
					default: 1,
					step: 1,
					tooltip,
				},
				{
					id: 'action',
					type: 'dropdown',
					label: 'Action',
					choices: [
						{ id: 0, label: 'Turn off' },
						{ id: 1, label: 'Turn on' },
						{ id: 2, label: 'Toggle' },
					],
					default: 2,
				},
			],
			callback: (action) => {
				const gpo = Math.floor((action.options.gpo-1) % 8 +1 ).toString()
				const device = Math.ceil(action.options.gpo / 8 ).toString()
				const path = [
						'device',
						'gpios',
						'deviceList', 'items', device,
						'gpoList', 'items', gpo,
					]
				let newstate = false
				if (action.options.action === 1) {
					newstate = true
				} else if (action.options.action === 2) {
					if (this.state.get(['DEVICE', ...path, 'status', 'pp', 'state']) === false) newstate = true
				}
				this.connection.sendWSmessage([...path, 'control', 'pp', 'activate'], newstate)
			},
		}

		return deviceGPO
	}


}
