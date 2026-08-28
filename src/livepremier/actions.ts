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

export default class ActionsLivepremier extends Actions {


	readonly actionsToUse = [
		'deviceScreenMemory',
		// 'deviceUpdatePreset' - only live-confirmed on LivePremier4 (192.168.20.112, 2026-08-28) so far. Plain
		// LivePremier's own "is Modified" feedback (awjdevice/feedback.ts base, unlike LP4's own override in
		// livepremier4/feedback.ts) reads a differently-shaped status path (presetList/items/{preset}/presetId/
		// status/pp/id, not presetBank/status/presetId/.../presetList/items/{A|B}/pp/id) - needs its own live
		// verification of both the read path AND the save/load write paths before enabling here, don't assume
		// they're identical to LP4's just because the feature exists on both.
		// 'deviceSaveScreenMemory' - same presetBank/control/save/... path family as deviceUpdatePreset above,
		// same live-verification caveat applies.
		// 'deviceAuxMemory',
		'deviceMasterMemory',
		'deviceLayerMemory',
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
		'remoteSync',
		// 'deviceStreamControl',
		// 'deviceStreamAudioMute',
		'deviceAudioRouteBlock',
		'deviceAudioRouteChannels',
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
	 * MARK: Take one or multiple screens
	 *
	 * "Wait for Transition Completion" (2026-08-28): no live-verified status field to poll for plain
	 * LivePremier (unlike LP4's confirmed screenAuxGroupList/.../status/pp/take) - instead delays by the
	 * screen's own configured takeUpTime/takeDownTime (already read/written elsewhere, e.g. deviceTakeTime,
	 * so this unit conversion is trusted) plus a small buffer, as the best available estimate of how long the
	 * real fade takes. Capped at 4500ms (2026-08-28) - Companion's own module-host IPC kills a single action
	 * call at a hard 5000ms regardless of what this code does (confirmed live, see waitForLevelReturnToRest's
	 * own doc comment for the full explanation) - staying under that ourselves avoids the resulting scary "Call
	 * timed out" error for a longer configured Transition Time, without changing the practical outcome (the
	 * next action fires around the same moment either way).
	 */
	// "Wait for Transition Completion" deliberately sits OUTSIDE the serialize()-guarded section below - see
	// LivePremier4's deviceTakeScreen for why (a later panic-button Cut on the same screen must never be stuck
	// queued behind a still-running, possibly long transition wait).
	get deviceTakeScreen() {
		const deviceTakeScreen = super.deviceTakeScreen
		deviceTakeScreen.callback = (action) => {
			let dir = 'xTakeUp'
			const targetScreens = action.options.screens === 'first'
				? this.choices.getSelectedScreens().slice(0, 1)
				: this.choices.getChosenScreenAuxes(action.options.screens)
			let longestTransitionMs = 0
			const sent = this.instance.serialize(targetScreens, async () => {
				for (const screen of targetScreens) {
					if (this.choices.getPreset(screen, 'pgm') === 'B') {
						dir = 'xTakeDown'
					}
					this.connection.sendWSmessage(['device', 'screenGroupList', 'items', screen, 'control', 'pp', dir], true)
					if (parseBoolean(action.options.waitForComplete)) {
						const timeProp = dir === 'xTakeUp' ? 'takeUpTime' : 'takeDownTime'
						const deciseconds = this.state.get(['DEVICE', 'device', 'screenGroupList', 'items', screen, 'control', 'pp', timeProp]) ?? 0
						longestTransitionMs = Math.max(longestTransitionMs, deciseconds * 100)
					}
				}
				// Confirms receipt only, not full completion - see waitForPulseComplete()'s doc comment for why
				// a fixed delay (not a status poll) is used specifically for Take/Cut.
				await this.delay(200)
			})
			if (!parseBoolean(action.options.waitForComplete)) return sent
			return sent.then(() => longestTransitionMs > 0 ? this.delay(Math.min(longestTransitionMs + 300, 4500)) : undefined)
		}
		return deviceTakeScreen
	}

	/**
	 *  MARK: Recall Screen Memory LivePremier
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
			for (const screen of screens) {
				const path = [
					'device',
					'presetBank',
					'control',
					'load',
					'slotList',
					'items',
					action.options.memory,
					'screenList',
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
				// Same reasoning as Recall Master Memory above - not independently live-verified for plain
				// LivePremier, fixed delay instead of assuming LP4's confirmed isLoading path applies here too.
				await this.delay(200)

				if (parseBoolean(action.options.selectScreens)) {
					if (this.state.syncSelection) {
						this.connection.sendWSdata('REMOTE', 'replace', '/live/screens/screenAuxSelection', [screens])
					} else {
						this.state.set('LOCAL/screenAuxSelection/keys', screens)
						this.instance.checkFeedbacks('liveScreenSelection')
					}
				}
			}
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
	 * MARK: Recall Master Memory - LivePremier
	 */
	get deviceMasterMemory() {

		const deviceMasterMemory = super.deviceMasterMemory

		deviceMasterMemory.callback = (action) => {
			const preset = this.choices.getPresetSelection(action.options.preset, true)
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

			// serialize() keyed by every screen this Master Memory affects - see its own doc comment for why
			// this must never be a single fixed key: an unrelated screen's action must never wait on this one.
			return this.instance.serialize(screens, async () => {
			const unlockedScreens = new Set<string>()
			const stillLocked = screens.filter((screen: string) => {
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
			this.connection.sendWSmessage( fullpath, false, true)
			this.instance.sendXupdate()
			// masterPresetBank shares LP4's exact path naming, but plain LivePremier hasn't been independently
			// live-verified this session to actually have the same "isLoading" flag - fixed delay for now
			// rather than assuming, same reasoning as Midra's Recall Master/Aux Memory above.
			await this.delay(200)

			if (action.options.selectScreens) {
				if (this.state.syncSelection) {
					this.connection.sendWSdata('REMOTE', 'replace', '/live/screens/screenAuxSelection', [screens])
				} else {
					this.state.set('LOCAL/screenAuxSelection/keys', screens)
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
	 * MARK: Select the source in a layer livepremier
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
							'device', 'screenList', 'items', screen,
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
								'device', 'screenList', 'items', layer.screenAuxKey,
								'presetList', 'items', this.choices.getPreset(layer.screenAuxKey, preset),
								'layerList', 'items', layer.layerKey,
								'source', 'pp', 'inputNum'
							], source)
						}
				})
			}
			this.instance.sendXupdate()
		}

		this.screens.forEach((screen) => {
			const isScreen = screen.id.startsWith('S')
			
			deviceSelectSource.options.push({
				id: `layer${screen.id}`,
				type: 'multidropdown',
				label: 'Layer ' + screen.id,
				choices: this.choices.getLayerChoices(screen.id, isScreen),
				default: ['1'],
				isVisibleExpression: `$(options:method) == 'spec' && arrayIncludes($(options:screen), '${screen.id}')`,
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
			},
		)
		
		return deviceSelectSource
	}

	/**
	 * MARK: Layer Properties - Source (V3) - LivePremier
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
			return targetScreens.map(screenAuxKey => ({screenAuxKey, layerKey: opt.layer}))
		}

		// "Get current values" (Companion's standard blue "Learn" button) - reads the first resolved layer's
		// current source and pins screen/preset/layer to the concrete values it read from.
		deviceSelectSourceV3.learn = (action) => {
			const targets = resolveTargets(action.options)
			if (targets.length === 0) return undefined
			const target = targets[0]

			const preset = this.choices.getPresetSelection()
			const presetpath = [
				'device', 'screenList', 'items', target.screenAuxKey,
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
				const presetpath = [
					'device', 'screenList', 'items', target.screenAuxKey,
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

	// MARK: Set Preset Toggle - LivePremier
	get devicePresetToggle() {
		const devicePresetToggle = super.devicePresetToggle

		devicePresetToggle.callback = (act) => {
			const allscreens = this.choices.getScreensAuxArray(true).map((itm) => itm.id)
			// device/transition/screenList/items/1/control/pp/enablePresetToggle
			// device/screenGroupList/items/S1/control/pp/copyMode
			
			let action = act.options.action
			if (action === 'toggle') {
				if (this.state.get('DEVICE/device/screenGroupList/items/S1/control/pp/copyMode') === false) action = 'off'
				else action = 'on'
			}
			if (action === 'on') allscreens.forEach((screen: string) =>
				this.connection.sendWSmessage(['device','screenGroupList','items',screen,'control','pp','copyMode'], false))
			if (action === 'off') allscreens.forEach((screen: string) =>
				this.connection.sendWSmessage(['device','screenGroupList','items',screen,'control','pp','copyMode'], true))
		}

		return devicePresetToggle
	}

	/**
	 *MARK:  Select Multiviewer Widget - LivePremier
	*/
	get remoteMultiviewerSelectWidget() {
		const remoteMultiviewerSelectWidget = super.remoteMultiviewerSelectWidget

		remoteMultiviewerSelectWidget.callback = (action) => {
			const mvw = action.options.widget?.split(':')[0] ?? '1'
			const widget = action.options.widget?.split(':')[1] ?? '0'
			let widgetSelection: Record<'mocOutputLogicKey' | 'widgetKey', string>[] = []
			if (this.state.syncSelection) {
				widgetSelection = [...(this.state.get('REMOTE/live/multiviewers/widgetSelection/widgetIds') ?? [])]
					.map((key) => {return {widgetKey: key.widgetKey, mocOutputLogicKey: key.multiviewerKey}})
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
				this.connection.sendWSdata('REMOTE', 'replace', '/live/multiviewers/widgetSelection',
					[
						widgetSelection
						.map((key) => {return {widgetKey: key.widgetKey, multiviewerKey: key.mocOutputLogicKey}})
					]
				)
			} else {
				this.state.set('LOCAL/widgetSelection/widgetIds', widgetSelection)
				this.instance.checkFeedbacks('remoteWidgetSelection')
			}
		}

		return remoteMultiviewerSelectWidget
	}

	/**
	 * MARK: Select the source in a multiviewer widget - Livepremier
	 */
	get deviceMultiviewerSource() {	
		const deviceMultiviewerSource = super.deviceMultiviewerSource

		deviceMultiviewerSource.callback = (action) => {
			let widgetSelection: Record<'mocOutputLogicKey' | 'widgetKey', string>[] = []
			if (action.options.widget === 'sel') {
				if (this.state.syncSelection) {
					widgetSelection = [...(this.state.get('REMOTE/live/multiviewers/widgetSelection/widgetIds') ?? [])]
						.map((key) => {return {widgetKey: key.widgetKey, mocOutputLogicKey: key.multiviewerKey}})
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
	 * MARK: Route audio block - Livepremier
	 */
	get deviceAudioRouteBlock() {
		type DeviceAudioRouteBlock = {device: number, out1: string, in1: string, out2?: string, in2?: string, out3?: string, in3?: string, out4?: string, in4?: string, blocksize: number}
		const audioOutputChoices = this.choices.getAudioOutputChoices()
		const audioInputChoices = this.choices.getAudioInputChoices()

		const deviceAudioRouteBlock: AWJaction<DeviceAudioRouteBlock> = {
			name: 'Audio - Route (Block)',
			sortName: '07 Audio - Route (Block)',
			description: 'Routes a contiguous block of audio input channels to a contiguous block of output channels in one step.',
			options: [
				{
					type: 'dropdown',
					label: 'Device',
					id: 'device',
					choices: [],
					default: '1',
					isVisibleExpression: 'false',
				},
				{
					type: 'dropdown',
					label: 'First Output Channel',
					id: 'out1',
					choices: audioOutputChoices,
					default: audioOutputChoices[0]?.id,
					minChoicesForSearch: 0,
				},
				{
					type: 'dropdown',
					label: 'First Input Channel',
					id: 'in1',
					choices: audioInputChoices,
					default: 'NONE',
					minChoicesForSearch: 0,
					tooltip: 'If you choose "No Source" the whole Block will be unrouted',
				},
				{
					type: 'number',
					label: 'Block Size',
					id: 'blocksize',
					default: Math.min( 8, audioInputChoices.length),
					min: 1,
					max: audioInputChoices.length,
					range: true,
				},
			],
			callback: (action) => {
				const outstart = audioOutputChoices.findIndex((item) => {
					return item.id === action.options.out1
				})
				const instart = audioInputChoices.findIndex((item) => {
					return item.id === action.options.in1
				})
				if (outstart > -1 && instart > -1) {
					const max = Math.min(
						audioOutputChoices.length - outstart,
						audioInputChoices.length - instart,
						action.options.blocksize
					) // since 'None' is input at index 0 no extra test is needed, it is possible to fill all outputs with none
					for (let s = 0; s < max; s += 1) {
						const path = [
							'device',
							'audio',
							'control',
							'txList',
							'items',
							audioOutputChoices[outstart + s].id.toString().split(':')[0],
							'channelList',
							'items',
							audioOutputChoices[outstart + s].id.toString().split(':')[1],
							'control',
							'pp',
							'source',
						]
						this.connection.sendWSmessage(path, audioInputChoices[instart === 0 ? 0 : instart + s].id)
					}
				}
			}
		}
		
		return deviceAudioRouteBlock
	}

	/**
	 * MARK: Route audio channels - Livepremier
	 */
	get deviceAudioRouteChannels() {
		type DeviceAudioRouteChannels = {device: number, out1: string, in1: string[], out2?: string, in2?: string[], out3?: string, in3?: string[], out4?: string, in4?: string[]}

		const audioOutputChoices = this.choices.getAudioOutputChoices()
		const audioInputChoices = this.choices.getAudioInputChoices()
		
		const deviceAudioRouteChannels: AWJaction<DeviceAudioRouteChannels> = {
			name: 'Audio - Route (Channels)',
			sortName: '07 Audio - Route (Channels)',
			description: 'Routes individual audio input channels to individual output channels, up to four pairs per call.',
			options: [
				{
					type: 'dropdown',
					label: 'Device',
					id: 'device',
					choices: [],
					default: 1,
					isVisibleExpression: 'false',
				},
				{
					type: 'dropdown',
					label: '(first) output channel',
					id: 'out1',
					choices: audioOutputChoices,
					default: audioOutputChoices[0]?.id,
					minChoicesForSearch: 0,
				},
				{
					type: 'multidropdown',
					label: 'input channel(s)',
					id: 'in1',
					choices: audioInputChoices,
					default: ['NONE'],
					minChoicesForSearch: 0,
					minSelection: 0,
				},
			],
			callback: (action) => {
				if (action.options.in1.length > 0) {
					const outstart = audioOutputChoices.findIndex((item) => {
						return item.id === action.options.out1
					})
					if (outstart > -1) {
						const max = Math.min(audioOutputChoices.length - outstart, action.options.in1.length)
						for (let s = 0; s < max; s += 1) {
							const path = [
								'device',
								'audio',
								'control',
								'txList',
								'items',
								audioOutputChoices[outstart + s].id.toString().split(':')[0],
								'channelList',
								'items',
								audioOutputChoices[outstart + s].id.toString().split(':')[1],
								'control',
								'pp',
								'source',
							]
							this.connection.sendWSmessage(path, action.options.in1[s])
						}
					}
				} else {
					const path = [
						'device',
						'audio',
						'control',
						'txList',
						'items',
						action.options.out1.split(':')[0],
						'channelList',
						'items',
						action.options.out1.split(':')[1],
						'control',
						'pp',
						'source',
					]
					this.connection.sendWSmessage(path, audioInputChoices[0]?.id)
				}
			}
		}

		return deviceAudioRouteChannels
	}

	/**
	 * MARK: Setup timer - LivePremier
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
				Math.round((splitRgb(action.options.bg_color).a || 1) * 255)
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
				Math.round((splitRgb(action.options.fg_color).a || 1) * 255)
			)
		}

		return deviceTimerSetup
	}

	/**
	 * MARK: Choose Testpatterns - LivePremier
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
				// Midra, which uses plain numeric keys) - getScreenChoices() is correct here. Deliberately
				// screens-only (not Aux via getScreenAuxChoices()) - auxscreens live under a different top-level
				// list this group's path never addresses.
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
					{ id: 'THIRTY_BPP_1', label: '30bit Testpattern #1' },
					{ id: 'THIRTY_BPP_2', label: '30bit Testpattern #2' },
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
					{ id: 'HORIZONTAL_GREY_SCALE', label: 'Horizontal Greyscale' },
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

		return this.deviceTestpatterns_common(deviceTestpatternsOptions, 'Device - Set LivePremier ≤ V3 Testpattern')

	}

	/**
	 * MARK: Testpattern Raster Box - LivePremier
	 */
	get deviceTestpatternRasterBox() {
		return this.deviceTestpatternRasterBox_common('Device - Set LivePremier ≤ V3 Testpattern Raster Box')
	}

	/**
	 * MARK: Adjust GPO
	 * LivePremier
	 */
	get deviceGPO() {
		type DeviceGPO = {gpo: number, action: number}
		
		const deviceGPO: AWJaction<DeviceGPO> = {
			name: 'Device - Set GPO',
			sortName: '09 Device - Set GPO',
			description: 'Turns a General Purpose Output (GPO) on, off, or toggles it.',
			options: [
				{
					id: 'gpo',
					type: 'number',
					label: 'GPO',
					min: 1,
					max: 8,
					range: true,
					default: 1,
					step: 1,
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
				const device = Math.ceil(action.options.gpo / 8 )
				if (device > 1) return
				const gpo = Math.floor(action.options.gpo).toString()
				const path = [
						'device',
						'gpio',
						'gpoList',
						'items',
						gpo
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
