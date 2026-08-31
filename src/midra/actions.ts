import {AWJinstance} from '../index.js'

import {
	CompanionActionContext,
	CompanionActionEvent,
	CompanionInputFieldDropdown,
	SomeCompanionActionInputField,
} from '@companion-module/base'
import { InstanceStatus } from '@companion-module/base'
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

export default class ActionsMidra extends Actions {


	readonly actionsToUse = [
		'deviceScreenMemory',
		// 'deviceUpdatePreset' - LivePremier/LivePremier4-specific "Save/Revert Screen Memory Changes" action, only
		// live-confirmed against a real Aquilon (LivePremier4) so far. Midra addresses its screen-memory-load
		// path differently (device/preset/bank/..., see deviceScreenMemory above) - needs its own live
		// verification (does a matching device/preset/bank/control/save/... path even exist?) before enabling.
		// 'deviceSaveScreenMemory' - same presetBank-family dependency as deviceUpdatePreset above, same caveat.
		'deviceAuxMemory',
		'deviceMasterMemory',
		// 'deviceLayerMemory',
		'deviceMultiviewerMemory',
		'deviceTakeScreen',
		'deviceCutScreen',
		'deviceTbar',
		'deviceTakeTime',
		'deviceScreenEncoderAdjustV3',
		'deviceInputKeying',
		'deviceInputFreeze',
		'deviceInputPlug',
		'deviceLayerFreeze',
		'deviceScreenFreeze',
		'deviceSelectSource',
		'devicePositionSize',
		'deviceSelectSourceV3',
		'devicePositionSizeV3',
		'deviceLayerTransitionsV3',
		// Layer Properties - Keying does not exist on Midra/Alta - live-confirmed 2026-08-28 against a Zenith
		// 200 simulator (fw 1.3.7): no `keying` property anywhere on a layer object, and no `device.keyerBank`
		// (the Keyer Bank memory-preset system this action reads from) anywhere in the state tree. "Set Input
		// Keying" (deviceInputKeying, chroma/luma mode directly on an input) is a different, unrelated concept
		// that DOES exist here (device/inputList/items/X/plugList/items/Y/settings/keying) and stays enabled.
		// 'deviceLayerKeyingV3',
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
		'deviceAssignImageLibraryToFrame',
		'remoteMultiviewerSelectWidget',
		'deviceMultiviewerSource',
		'selectScreen',
		'lockScreen',
		'selectPreset',
		'selectLayer',
		'selectLayerV3',
		'remoteSync',
		'deviceStreamControl',
		'deviceStreamAudioMute',
		'deviceAudioRouteBlock',
		'deviceAudioRouteChannels',
		'deviceAudioDanteFunctions',
		'deviceTimerSetup',
		'deviceTimerAdjust',
		'deviceTimerTransport',
		'deviceTestpatterns',
		'cstawjcmd',
		'cstawjgetcmd',
		'devicePower',
		// Backup (Input Backup + Background Set Backup) does not exist on Midra/Alta at all - live-confirmed
		// 2026-08-28 against a Zenith 200 simulator (fw 1.3.7): no `device.backup` anywhere in the state tree.
		// Unlike the Aquilon firmware-version gate (see isBackupSupportedFirmware() in the base Actions class),
		// this is a structural platform difference, not a version gate, so the actions are removed entirely
		// rather than shown with a "please update" notice.
		// 'deviceBackupSetSource',
		// 'deviceBackupAutoMode',
	]
	
	constructor (instance: AWJinstance) {
		super(instance)
		this.instance = instance
		this.init()
	}


	/**
	 *  MARK: Recall Screen Memory Midra
	 */
	get deviceScreenMemory(): AWJaction<{ screens: string, preset: string, memory: string, selectScreens: boolean, unlockIfLocked: boolean, relockAfterChange: boolean}>  {

		const deviceScreenMemory  = super.deviceScreenMemory

		deviceScreenMemory.options[0]['choices'] = [{ id: 'first', label: 'First/Only Selected Screen' }, { id: 'sel', label: 'All Selected Screens' }, ...this.choices.getScreenChoices()]
		deviceScreenMemory.callback = (action) => {
			const screens = action.options.screens === 'first'
				? this.choices.getSelectedScreens().slice(0, 1)
				: this.choices.getChosenScreens(action.options.screens)
			return this.instance.serialize(screens, async () => {
			const preset = this.choices.getPresetSelection(action.options.preset, true)
			const unlockedScreens = new Set<string>()
			for (const screen of screens) {
				const path = [
					'device',
					'preset',
					'bank',
					'control',
					'load',
					'slotList',
					'items',
					action.options.memory,
					'screenList',
					'items',
					screen.replaceAll(/\D/g, ''),
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
				// No live Midra/Alta access this session to confirm an equivalent "isLoading" flag - fixed
				// delay for now, same reasoning as deviceAuxMemory/deviceMasterMemory above.
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

		return deviceScreenMemory
	}

	// MARK: recall Aux memory
	get deviceAuxMemory() {
		const deviceAuxMemory = super.deviceAuxMemory

		deviceAuxMemory.callback = (action) => {
			const screens = action.options.screens === 'first'
				? this.choices.getSelectedScreens().slice(0, 1)
				: this.choices.getChosenAuxes(action.options.screens as string)
			return this.instance.serialize(screens, async () => {
			const preset = this.choices.getPresetSelection(action.options.preset as string, true)
			for (const screen of screens) {
				if (this.choices.isLocked(screen, preset)) continue
				const fullpath = [
					'device',
					'preset',
					'auxBank',
					'control',
					'load',
					'slotList',
					'items',
					action.options.memory,
					'auxiliaryScreenList',
					'items',
					screen.replace(/\D/g, ''),
					'presetList',
					'items',
					preset,
					'pp',
					'xRequest',
				]
				this.connection.sendWSmessage( fullpath, false, true)
				this.instance.sendXupdate()

				if (parseBoolean(action.options.selectScreens)) {
					if (this.state.syncSelection) {
						this.connection.sendWSdata('REMOTE', 'replace', '/live/screens/screenAuxSelection', [screens])
					} else {
						this.state.set('LOCAL/screenAuxSelection/keys', screens)
						this.instance.checkFeedbacks('liveScreenSelection')
					}
				}
			}
			// TODO: no live Midra/Alta access this session to confirm whether an equivalent per-slot "isLoading"
			// flag exists at device/preset/auxBank/control/load/.../pp/isLoading (mirroring the LivePremier4
			// structure confirmed for Recall Screen/Layer Memory and Recall Master Memory) - using a fixed
			// delay for now instead of guessing an unverified path. Replace with waitForPulseComplete() once
			// confirmed live, same as the other Recall actions.
			await this.delay(200)
			})
		}

		return deviceAuxMemory
	}

	/**
	 * MARK: Recall Master Memory - Midra
	 */
	get deviceMasterMemory() {

		const deviceMasterMemory = super.deviceMasterMemory

		deviceMasterMemory.callback = (action) => {
			const bankpath = ['device', 'preset', 'masterBank']
			const list = 'slotList'
			const memorypath = ['items', action.options.memory]
			const loadpath = ['control', 'load', 'slotList']

			const filterpath = this.state.get(['DEVICE', ...bankpath, list, ...memorypath, 'status', 'pp', 'isShadow']) ? ['status', 'shadow', 'pp'] : ['status', 'pp']

			const screens = [
				...(this.state.get([
					'DEVICE',
					...bankpath,
					list,
					...memorypath,
					...filterpath,
					'screenFilter',
				]) ?? []).map((scr: string) => 'S' + scr),
				...(this.state.get([
					'DEVICE',
					...bankpath,
					list,
					...memorypath,
					...filterpath,
					'auxFilter',
				]) ?? []).map((scr: string) => 'A' + scr)
			]

			// serialize() keyed by every screen/aux this Master Memory affects - see its own doc comment for why
			// this must never be a single fixed key: an unrelated screen's action must never wait on this one.
			return this.instance.serialize(screens, async () => {
			const preset = this.choices.getPresetSelection(action.options.preset, true)
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
			this.connection.sendWSmessage( fullpath, false, true )
			this.instance.sendXupdate()
			// TODO: no live Midra/Alta access this session to confirm an equivalent per-slot "isLoading" flag
			// at device/preset/masterBank/control/load/.../pp/isLoading - fixed delay for now, same reasoning
			// as deviceAuxMemory above.
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
	 * MARK: Recall Multiviewer Memory
	 */
	get deviceMultiviewerMemory() {
		const deviceMultiviewerMemory = super.deviceMultiviewerMemory

		deviceMultiviewerMemory.callback = (action) => {
			const fullpath = [
				'device',
				'multiviewer',
				'bankList',
				'control',
				'load',
				'slotList',
				'items',
				action.options.memory,
				'pp',
				'xRequest',
			]

			this.connection.sendWSmessage( fullpath, false, true)
				
		}

		return deviceMultiviewerMemory
	}

	/**
	 * MARK: Take one or multiple screens
	 *
	 * "Wait for Transition Completion" (2026-08-28): no live-verified status field to poll on Midra/Alta this
	 * session - instead delays by the screen's own configured takeTime (same path already written by
	 * deviceTakeTime above, so the unit/location is trusted) plus a small buffer. Capped at 4500ms - Companion's
	 * own module-host IPC kills a single action call at a hard 5000ms regardless (confirmed live, see
	 * waitForLevelReturnToRest's doc comment in the base class for the full explanation).
	 */
	// "Wait for Transition Completion" deliberately sits OUTSIDE the serialize()-guarded section below - see
	// LivePremier4's deviceTakeScreen for why (a later panic-button Cut on the same screen must never be stuck
	// queued behind a still-running, possibly long transition wait).
	get deviceTakeScreen() {
		const deviceTakeScreen = super.deviceTakeScreen
		deviceTakeScreen.callback = (action) => {
			const targetScreens = action.options.screens === 'first'
				? this.choices.getSelectedScreens().slice(0, 1)
				: this.choices.getChosenScreenAuxes(action.options.screens)
			let longestTransitionMs = 0
			const sent = this.instance.serialize(targetScreens, async () => {
				for (const screen of targetScreens) {
					const screeninfo = this.choices.getScreenInfo(screen)
					this.connection.sendWSmessage(['device', 'transition', `${screeninfo.prefixverylong}List`, 'items', screeninfo.numstr, 'control', 'pp', 'xTake'], true)
					if (parseBoolean(action.options.waitForComplete)) {
						const deciseconds = this.state.get(['DEVICE', 'device', 'transition', `${screeninfo.prefixverylong}List`, 'items', screeninfo.numstr, 'control', 'pp', 'takeTime']) ?? 0
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
	 * MARK: Cut one or multiple screens
	 */
	get deviceCutScreen() {
		const deviceCutScreen = super.deviceCutScreen

		deviceCutScreen.callback = (action) => {
			const targetScreens = action.options.screens === 'first'
				? this.choices.getSelectedScreens().slice(0, 1)
				: this.choices.getChosenScreenAuxes(action.options.screens)
			return this.instance.serialize(targetScreens, async () => {
			for (const screen of targetScreens) {
				this.connection.sendWSmessage(
					[
						...(screen.startsWith('A') ? this.constants.auxGroupPath : this.constants.screenGroupPath),
						'items',
						screen.replaceAll(/\D/g, ''),
						'control',
						'pp',
						'xCut'
					],
					true
				)
			}
			// Confirms receipt only, not full completion - see waitForPulseComplete()'s doc comment for why a
			// fixed delay (not a status poll) is used specifically for Take/Cut.
			await this.delay(200)
			})
		}

		return deviceCutScreen
	}

	/**
	 * MARK: Set T-Bar Position
	 */
	get deviceTbar() {		
		const deviceTbar = super.deviceTbar

		deviceTbar.callback =  async (action) => {
			const position = parseFloat(action.options.position)
			const maximum = parseFloat(action.options.maximum)
			const tbarmax = 65535
			if (typeof position === 'number' && typeof maximum === 'number' && position >= 0 && maximum >= 0) {
				let value = 0.0
				if (position >= maximum) {
					value = 1.0
				} else if (maximum > 0) {
					value = position / maximum
				}
				const tbarint = Math.round(value * tbarmax)
				const targetScreens = action.options.screens === 'first'
					? this.choices.getSelectedScreens().slice(0, 1)
					: this.choices.getChosenScreenAuxes(action.options.screens)
				for (const screen of targetScreens) {
					this.connection.sendWSmessage(
						[
							...(screen.startsWith('A') ? this.constants.auxGroupPath : this.constants.screenGroupPath),
							'items',
							screen.replaceAll(/\D/g, ''), 
							'control', 
							'pp', 
							'tbarPosition'
						], 
						tbarint
					)
				}
			}
		}

		return deviceTbar
	}

	/**
	 * MARK: Change the transition time of a preset per screen - Midra
	 */
	get deviceTakeTime() {
		const deviceTakeTime = super.deviceTakeTime

		deviceTakeTime.callback = (action) => {
			const targetScreens = action.options.screens === 'first'
				? this.choices.getSelectedScreens().slice(0, 1)
				: this.choices.getChosenScreenAuxes(action.options.screens)
			return this.instance.serialize(targetScreens, async () => {
			// round to whole deciseconds - see the same fix in the base action for why
			const time = Math.round(action.options.time * 10)
			const waitPromises: Promise<boolean>[] = targetScreens.map((screen) => {
				const path = [
					...(screen.startsWith('A') ? this.constants.auxGroupPath : this.constants.screenGroupPath),
					'items',
					screen.replaceAll(/\D/g, ''),
					'control',
					'pp',
					'takeTime'
				]
				this.connection.sendWSmessage(path, time)
				return this.waitForStateValue(['DEVICE', ...path], (v) => v === time)
			})
			await Promise.all(waitPromises)
			})
		}

		return deviceTakeTime
	}

	// MARK: Select the source in a layer midra
	get deviceSelectSource() {
		const deviceSelectSource = super.deviceSelectSource

		deviceSelectSource.callback = (action) => {
			if (action.options.method === 'spec') {
				for (const scr of action.options.screen) {
					const screen = this.choices.getScreenInfo(scr)
					if (this.choices.isLocked(screen.id, action.options.preset)) continue
					const presetpath = [
						'device', 
						screen.prefixverylong + 'List',
						'items', screen.platformId, 
						'presetList', 'items', this.choices.getPreset(screen.id, action.options.preset)
					]
					if (screen.isAux && action.options['sourceBack'] !== 'keep')
						// on Midra on aux there is only background, so we don't show a layer dropdown and just set the background
						this.connection.sendWSmessage([...presetpath, 'background', 'source', 'pp', 'content'], action.options['sourceBack'])
					else
						// else decide which dropdown to use for which layer
						for (const layer of action.options[`layer${screen.id}`]) {
							if (layer === 'NATIVE' && action.options['sourceNative'] !== 'keep') {
								this.connection.sendWSmessage([...presetpath, 'background', 'source', 'pp', 'set'], action.options['sourceNative'].replace(/\D/g, ''))
							} else if (layer === 'TOP' && action.options['sourceFront'] !== 'keep') {
								this.connection.sendWSmessage([...presetpath, 'top', 'source', 'pp', 'frame'], action.options['sourceFront'].replace(/\D/g, ''))
							} else if ( action.options['sourceLayer'] !== 'keep') {
								this.connection.sendWSmessage([...presetpath, 'liveLayerList', 'items', layer, 'source', 'pp', 'input'], action.options['sourceLayer'])
							}
						}
				}
			} else if (action.options.method === 'sel') {
				const preset = this.choices.getPresetSelection('sel')
				this.choices.getSelectedLayers()
					.filter((selection) => this.choices.isLocked(selection.screenAuxKey, preset) === false)
					.map(layer => {
						return {
							screen: this.choices.getScreenInfo(layer.screenAuxKey),
							layerKey: layer.layerKey 
						}
					})
					.forEach((layer) => {
						const presetpath = [
							'device', 
							layer.screen.isAux ? 'auxiliaryScreenList' : 'screenList',
							'items', layer.screen.platformId, 
							'presetList', 'items', this.choices.getPreset(layer.screen.id,'sel')
						]
						if (layer.layerKey === 'BKG' && layer.screen.isScreen && action.options['sourceNative'] !== 'keep') {
								this.connection.sendWSmessage([...presetpath, 'background', 'source', 'pp', 'set'], action.options['sourceNative'].replace(/\D/g, ''))
							} else if (layer.layerKey === 'BKG' && layer.screen.isAux && action.options['sourceBack'] !== 'keep') {
								this.connection.sendWSmessage([...presetpath, 'background', 'source', 'pp', 'content'], action.options['sourceBack'])
							} else if (layer.layerKey === 'TOP' && action.options['sourceFront'] !== 'keep') {
								this.connection.sendWSmessage([...presetpath, 'top', 'source', 'pp', 'frame'], action.options['sourceFront'].replace(/\D/g, ''))
							} else if ( action.options['sourceLayer'] !== 'keep') {
								this.connection.sendWSmessage([...presetpath, 'liveLayerList', 'items', layer.layerKey, 'source', 'pp', 'input'], action.options['sourceLayer'])
							}
					})
			}
			this.instance.sendXupdate()
		}

		// don't build a dropdown for aux on midra
		this.choices.getScreensArray().forEach((screen) => {

			deviceSelectSource.options.push({
				id: `layer${screen.id}`,
				type: 'multidropdown',
				label: 'Layer ' + screen.id,
				// frozen deprecated V2 choice list - not sourced from getLayerChoices() anymore, which now
				// emits 'BG' for Background (see the module-wide 'BG' rename) - this action keeps 'NATIVE' forever
				choices: [{ id: 'NATIVE', label: 'Background' }, ...this.choices.getLayerChoices(screen.id, false)],
				default: ['1'],
				isVisibleExpression: `$(options:method) == 'spec' && arrayIncludes($(options:screen), '${screen.id}')`,
				disableAutoExpression: true,
			})
		})
		deviceSelectSource.options.push(
			{
				id: 'sourceNative',
				type: 'dropdown',
				label: 'Screen Background Source',
				choices: [{ id: 'keep', label: "Don't change source"}, ...this.choices.choicesBackgroundSourcesPlusNone],
				default: 'keep',
				// TODO(isVisible-migration): original logic hides this field only when method is 'spec' and none of the
				// selected S-prefixed screens have a NATIVE ('BKG') layer selected in their per-screen layer field. This
				// depends on a dynamic, per-screen set of multidropdown fields (layer<screenId>) that cannot be
				// expressed generically in Companion's expression language. Falling back to always-visible to avoid
				// silently hiding functionality; needs manual review.
				isVisibleExpression: 'true',
				disableAutoExpression: true,
			},
			{
				id: 'sourceLayer',
				type: 'dropdown',
				label: 'Screen Layer Source',
				choices: [{ id: 'keep', label: "Don't change source"}, ...this.choices.getSourceChoices()],
				default: 'keep',
				// TODO(isVisible-migration): original logic hides this field only when method is 'spec' and none of the
				// selected screens (of any kind) have a non-NATIVE (numeric) layer selected in their per-screen layer
				// field. This depends on a dynamic, per-screen set of multidropdown fields (layer<screenId>) that cannot
				// be expressed generically in Companion's expression language. Falling back to always-visible to avoid
				// silently hiding functionality; needs manual review.
				isVisibleExpression: 'true',
				disableAutoExpression: true,
			},
			{
				id: 'sourceFront',
				type: 'dropdown',
				label: 'Screen Foreground Source',
				choices: [{ id: 'keep', label: "Don't change source"}, ...this.choices.choicesForegroundImagesSource],
				default: 'keep',
				// TODO(isVisible-migration): original logic hides this field only when method is 'spec' and none of the
				// selected S-prefixed screens have a TOP layer selected in their per-screen layer field. This depends on
				// a dynamic, per-screen set of multidropdown fields (layer<screenId>) that cannot be expressed
				// generically in Companion's expression language. Falling back to always-visible to avoid silently
				// hiding functionality; needs manual review.
				isVisibleExpression: 'true',
				disableAutoExpression: true,
			},
			{
				id: 'sourceBack',
				type: 'dropdown',
				label: 'Aux Background Source',
				choices: [{ id: 'keep', label: "Don't change source"}, ...this.choices.getAuxBackgroundChoices()],
				default: 'keep',
				// TODO(isVisible-migration): original logic hides this field only when method is 'spec' and none of the
				// selected A-prefixed screens have a BKG layer selected in their per-screen layer field. This depends on
				// a dynamic, per-screen set of multidropdown fields (layer<screenId>) that cannot be expressed
				// generically in Companion's expression language. Falling back to always-visible to avoid silently
				// hiding functionality; needs manual review.
				isVisibleExpression: 'true',
				disableAutoExpression: true,
			},
		)

		return deviceSelectSource
	}

	/**
	 * MARK: Layer Properties - Source (V3) - Midra
	 */
	get deviceSelectSourceV3() {
		const deviceSelectSourceV3 = super.deviceSelectSourceV3

		// Midra's Layer choices also include the TOP (foreground frame) layer, which LP/LP4 don't have
		const layerField = deviceSelectSourceV3.options.find((opt) => opt.id === 'layer')
		if (layerField) {
			layerField['choices'] = [
				{ id: 'first', label: 'First/Only Selected Layer' },
				{ id: 'sel', label: 'All Selected Layers' },
				...this.choices.getLayerChoices(this.choices.getMaxConfiguredLayerCount(), true, true),
			]
		}

		// Aux screens (background only, via "content") and the TOP frame layer (via "frame") use their own
		// separate device properties, distinct from numbered layers' "sourceLayer" - added here as raw
		// passthrough textinputs (blank = don't change) since their exact accepted values are NOT live-verified
		// on Midra yet (unlike sourceLayer/sourceColor, confirmed live on LivePremier4 only). This fixes a real
		// bug found live-auditing this action: the callback below always referenced
		// `action.options['sourceBack']`/`['sourceFront']` even though no such fields existed in the schema,
		// so they were always `undefined` at runtime - silently sending `undefined` to every Aux target on
		// every run (even with nothing changed), and throwing on every TOP-layer target (`undefined.replace`
		// is not a function). Shown unconditionally like sourceLayer/sourceColor (same "showing an unneeded
		// field is safer than hiding a needed one" precedent used elsewhere in this file), only applied when
		// the resolved target is actually an Aux/TOP layer.
		const sourceColorIndex = deviceSelectSourceV3.options.findIndex((opt) => opt.id === 'sourceColor')
		if (sourceColorIndex !== -1) {
			deviceSelectSourceV3.options.splice(sourceColorIndex + 1, 0,
				{
					id: 'sourceBack',
					type: 'textinput',
					label: 'Aux Background Source',
					tooltip: 'Leave empty to not change this value. Only applies when the resolved target is an Aux screen (which only has a background, no per-layer addressing on Midra). Raw value, sent 1:1 - exact accepted values not yet confirmed live on Midra.',
					default: '',
					useVariables: true,
				},
				{
					id: 'sourceFront',
					type: 'textinput',
					label: 'TOP Frame Source',
					tooltip: 'Leave empty to not change this value. Only applies when the resolved target is the TOP (foreground frame) layer. Raw value (digits only are used), sent 1:1 - exact accepted values not yet confirmed live on Midra.',
					default: '',
					useVariables: true,
				},
			)
		}

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
			const screen = this.choices.getScreenInfo(target.screenAuxKey)

			const preset = this.choices.getPresetSelection()
			const presetpath = [
				'device',
				screen.prefixverylong + 'List',
				'items', screen.platformId,
				'presetList', 'items', this.choices.getPreset(screen.id, preset)
			]

			const newoptions: Partial<typeof action.options> & {sourceBack?: string, sourceFront?: string} = {
				screen: screen.id,
				layer: target.layerKey,
				preset,
			}

			const readColor = (colorpath: string[]) => {
				const r = this.state.get(['DEVICE', ...colorpath, 'red']) ?? 0
				const g = this.state.get(['DEVICE', ...colorpath, 'green']) ?? 0
				const b = this.state.get(['DEVICE', ...colorpath, 'blue']) ?? 0
				return (r << 16) + (g << 8) + b
			}

			if (screen.isAux) {
				const raw = this.state.get(['DEVICE', ...presetpath, 'background', 'source', 'pp', 'content'])
				if (typeof raw === 'string') newoptions.sourceBack = raw
				return newoptions
			}

			if (target.layerKey === 'TOP') {
				const raw = this.state.get(['DEVICE', ...presetpath, 'top', 'source', 'pp', 'frame'])
				if (raw !== undefined) newoptions.sourceFront = String(raw)
				return newoptions
			}

			if (target.layerKey === 'NATIVE' || target.layerKey === 'BKG') {
				const raw = this.state.get(['DEVICE', ...presetpath, 'background', 'source', 'pp', 'set'])
				if (typeof raw !== 'string') return newoptions
				newoptions.sourceLayer = /^\d+$/.test(raw) ? `NATIVE_${raw}` : raw
				if (raw === 'COLOR') newoptions.sourceColor = readColor([...presetpath, 'background', 'source', 'color', 'pp'])
				return newoptions
			}

			const raw = this.state.get(['DEVICE', ...presetpath, 'liveLayerList', 'items', target.layerKey, 'source', 'pp', 'input'])
			if (typeof raw === 'string') {
				newoptions.sourceLayer = raw
				if (raw === 'COLOR') newoptions.sourceColor = readColor([...presetpath, 'liveLayerList', 'items', target.layerKey, 'source', 'color', 'pp'])
			}
			return newoptions
		}

		deviceSelectSourceV3.callback = (action) => {
			const preset = action.options.preset
			for (const target of resolveTargets(action.options)) {
				const screen = this.choices.getScreenInfo(target.screenAuxKey)
				let unlockedByUs = false
				if (this.choices.isLocked(screen.id, preset)) {
					if (!parseBoolean(action.options.unlockIfLocked)) continue
					this.choices.setScreenLock(screen.id, preset, false)
					unlockedByUs = true
				}
				const presetpath = [
					'device',
					screen.prefixverylong + 'List',
					'items', screen.platformId,
					'presetList', 'items', this.choices.getPreset(screen.id, preset)
				]
				// on Midra, aux screens only have a background - there is no per-layer addressing at all
				if (screen.isAux) {
					if (action.options['sourceBack'] !== '') {
						this.connection.sendWSmessage([...presetpath, 'background', 'source', 'pp', 'content'], action.options['sourceBack'])
					}
				} else if (target.layerKey === 'NATIVE' || target.layerKey === 'BKG') {
					const source = action.options['sourceLayer']
					// NOT live-verified on Midra (only confirmed on a LivePremier4 device: color lives at
					// .../source/color/pp/{red,green,blue}, sibling to .../source/pp/{inputNum|set|input}) -
					// assumed to follow the same sibling-of-source convention here, please verify before relying on it
					const colorpath = [...presetpath, 'background', 'source', 'color', 'pp']
					const sendColor = (r: number, g: number, b: number) => {
						this.connection.sendWSmessage([...colorpath, 'red'], r)
						this.connection.sendWSmessage([...colorpath, 'green'], g)
						this.connection.sendWSmessage([...colorpath, 'blue'], b)
					}
					if (source === 'NONE') {
						this.connection.sendWSmessage([...presetpath, 'background', 'source', 'pp', 'set'], 'NONE')
						sendColor(0, 0, 0) // "None" always resets the background to black, regardless of the color picker
					} else if (source === 'COLOR') {
						this.connection.sendWSmessage([...presetpath, 'background', 'source', 'pp', 'set'], 'COLOR')
						const color = Number(action.options['sourceColor'])
						sendColor((color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff)
					} else if (/^NATIVE_\d+$/.test(source)) {
						this.connection.sendWSmessage([...presetpath, 'background', 'source', 'pp', 'set'], source.replace(/\D/g, ''))
					}
					// anything else picked from the shared list isn't valid for a background layer - no-op
				} else if (target.layerKey === 'TOP' && action.options['sourceFront'] !== '') {
					this.connection.sendWSmessage([...presetpath, 'top', 'source', 'pp', 'frame'], action.options['sourceFront'].replace(/\D/g, ''))
				} else if (action.options['sourceLayer'] !== 'keep') {
					this.connection.sendWSmessage([...presetpath, 'liveLayerList', 'items', target.layerKey, 'source', 'pp', 'input'], action.options['sourceLayer'])
					if (action.options['sourceLayer'] === 'COLOR') {
						const color = Number(action.options['sourceColor'])
						const colorpath = [...presetpath, 'liveLayerList', 'items', target.layerKey, 'source', 'color', 'pp']
						this.connection.sendWSmessage([...colorpath, 'red'], (color >> 16) & 0xff)
						this.connection.sendWSmessage([...colorpath, 'green'], (color >> 8) & 0xff)
						this.connection.sendWSmessage([...colorpath, 'blue'], color & 0xff)
					}
				}
				if (unlockedByUs && parseBoolean(action.options.relockAfterChange)) {
					this.choices.setScreenLock(screen.id, preset, true)
				}
			}
			this.instance.sendXupdate()
		}

		// inserted before the last 2 fields (Unlock Screen if locked? / Relock after change), which must stay last
		deviceSelectSourceV3.options.splice(deviceSelectSourceV3.options.length - 2, 0,
			{
				id: 'sourceFront',
				type: 'dropdown',
				label: 'Screen Foreground Source',
				choices: [{ id: 'keep', label: "Don't change source" }, ...this.choices.choicesForegroundImagesSource],
				default: 'keep',
			},
			{
				id: 'sourceBack',
				type: 'dropdown',
				label: 'Aux Background Source',
				choices: [{ id: 'keep', label: "Don't change source" }, ...this.choices.getAuxBackgroundChoices()],
				default: 'keep',
			},
		)

		return deviceSelectSourceV3
	}


	/**
	 * MARK: Set input keying
	 */
	get deviceInputKeying() {
		const deviceInputKeying = super.deviceInputKeying

		deviceInputKeying.callback = (action) => {
			let input = action.options.input.replace('IN_', 'INPUT_')
			this.connection.sendWSmessage(
				[
					'device',
					'inputList',
					'items',
					input,
					'plugList',
					'items',
					this.state.get('DEVICE/device/inputList/items/' + input + '/status/pp/plug'),
					'settings',
					'keying',
					'control',
					'pp',
					'mode',
				],
				action.options.mode
			)
			this.instance.sendXupdate()
		}

		return deviceInputKeying
	}

	/**
	 * MARK: Change input freeze
	 */
	get deviceInputFreeze() {
		const deviceInputFreeze = super.deviceInputFreeze
			
		deviceInputFreeze.callback = (action) => {
			const input = action.options.input.replace('IN_', 'INPUT_')
			let val = false
			if (action.options.mode === 1) {
				val = true
			} else if (action.options.mode === 2) {
				val = !this.state.get('DEVICE/device/inputList/items/' + input + '/control/pp/freeze')
			}
			this.connection.sendWSmessage(['device', 'inputList', 'items', input, 'control', 'pp', 'freeze'], val)
		}

		return deviceInputFreeze
	}

	// MARK: Set input plug
	get deviceInputPlug() {
		type DeviceInputPlug = Record<string,string>

		const deviceInputPlug: AWJaction<DeviceInputPlug> = {
			name: 'Preconfig - Set Input Plug',
			sortName: '07 Preconfig - Set Input Plug',
			description: 'Assigns which physical plug an Input uses (Midra only).',
			options: [
				{
					id: 'input',
					type: 'dropdown',
					label: 'Input',
					choices: this.choices.getLiveInputArray()
						.filter((input) => this.choices.getPlugChoices(input.id).length > 1)
						.map((input) => {
							return {
								id: input.id,
								label: 'Input '+ input.index + (input.label.length ? ' - ' + input.label : '')
							}
						}
					),
					default: this.choices.getLiveInputArray()
						.filter((input) => this.choices.getPlugChoices(input.id).length > 1)
						.map(input => input.id)[0] ?? '',
					disableAutoExpression: true,
				},
				...this.choices.getLiveInputArray()
					.filter((input) => this.choices.getPlugChoices(input.id).length > 1)
					.map((input) => {
						const plugs = this.choices.getPlugChoices(input.id)
						return {
							id: 'plugs' + input.id,
							type: 'dropdown' as const,
							label: 'Plug',
							choices: plugs,
							default: plugs[0].id,
							isVisibleExpression: `$(options:input) == '${input.id}'`,
						}
					}
				),

			],
			callback: (action) => {
				this.connection.sendWSmessage([
					'device', 'inputList', 'items',
					action.options.input ?? '',
					'control', 'pp', 'plug'
				], action.options[`plugs${ action.options.input }`] ?? '1')
			}
		}

		return deviceInputPlug
	}


	/**
	 * MARK: Layer position and size V3
	 */
	get devicePositionSizeV3() {
		const devicePositionSizeV3 = super.devicePositionSizeV3

		devicePositionSizeV3.options[0] = {
			id: 'screen',
			type: 'dropdown',
			label: 'Screen',
			choices: [{ id: 'first', label: 'First/Only Selected Screen' }, { id: 'sel', label: 'All Selected Screens' }, ...this.choices.getScreenChoices()],
			default: 'first',
			allowInvalidValues: true,
		}

		return devicePositionSizeV3

	}

	/**
	 * MARK: Reset Layer Size or Ratio
	 */
	get deviceResetLayerSize() {
		const deviceResetLayerSize = super.deviceResetLayerSize

		deviceResetLayerSize.options[0] = {
			id: 'screen',
			type: 'dropdown',
			label: 'Screen',
			choices: [{ id: 'first', label: 'First/Only Selected Screen' }, { id: 'sel', label: 'All Selected Screens' }, ...this.choices.getScreenChoices()],
			default: 'first',
			allowInvalidValues: true,
		}

		return deviceResetLayerSize
	}

	/**
	 * MARK: Layer position and size (deprecated V2)
	 */
	get devicePositionSize() {
		const devicePositionSize = super.devicePositionSize

		devicePositionSize.options[0] = {
			id: 'screen',
			type: 'dropdown',
			label: 'Screen',
			choices: [{ id: 'sel', label: 'All Selected Screens' }, ...this.choices.getScreenChoices()],
			default: 'sel',
			allowInvalidValues: true,
			disableAutoExpression: true,
		}

		return devicePositionSize

	}

	// MARK: Set Preset Toggle - Midra
	get devicePresetToggle() {
		const devicePresetToggle = super.devicePresetToggle

		devicePresetToggle.callback = (act) => {
			const allscreens = this.choices.getScreensAuxArray(true).map((itm) => this.choices.getScreenInfo(itm.id))

			let action = act.options.action
			if (action === 'toggle') {
				if (this.state.get('DEVICE/device/transition/screenList/items/1/control/pp/enablePresetToggle') === true) action = 'off'
				else action = 'on'
			}
			if (action === 'on') allscreens.forEach((screen) =>
				this.connection.sendWSmessage(['device','transition', screen.prefixverylong + 'List','items', screen.numstr ,'control','pp','enablePresetToggle'], true))
			if (action === 'off') allscreens.forEach((screen) =>
				this.connection.sendWSmessage(['device','transition', screen.prefixverylong + 'List','items', screen.numstr ,'control','pp','enablePresetToggle'], false))
		}

		return devicePresetToggle
	}

	/**
	 *MARK:  Select Multiviewer Widget - Midra
	*/
	get remoteMultiviewerSelectWidget() {
		const remoteMultiviewerSelectWidget = super.remoteMultiviewerSelectWidget

		remoteMultiviewerSelectWidget.callback = (action) => {
			const mvw = action.options.widget?.split(':')[0] ?? '1'
			const widget = action.options.widget?.split(':')[1] ?? '0'
			let widgetSelection: Record<'mocOutputLogicKey' | 'widgetKey', string>[] = []
			if (this.state.syncSelection) {
				widgetSelection = [...(this.state.get('REMOTE/live/multiviewer/widgetSelection/widgetKeys') ?? []).map((key: string) => {return {widgetKey: key, mocOutputLogicKey: '1'}})]
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
				this.connection.sendWSdata('REMOTE', 'replace', '/live/multiviewer/widgetSelection', [widgetSelection.map((itm: {widgetKey: string}) => itm.widgetKey)])
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
					widgetSelection = [...(this.state.get('REMOTE/live/multiviewer/widgetSelection/widgetKeys') ?? []).map((key: string) => {return {widgetKey: key, mocOutputLogicKey: '1'}})]
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
						'multiviewer',
						'widgetList', 'items', widget.widgetKey,
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
	 * MARK: Select Layer locally or remote - Midra
	 */
	get selectLayer() {
		const selectLayer = super.selectLayer
		
		selectLayer.callback = (action) => {
			type Key = Record<'screenAuxKey' | 'layerKey', string>
			let ret: Key[] = []
			if (action.options.method?.endsWith('tgl')) {
				if (this.state.syncSelection) {
					ret = this.state.get('REMOTE/live/screens/layerSelection/layerIds')
						.map((key: Key) => {
							return {
								screenAuxKey: key.screenAuxKey.replace(/(?<!^)\D/g, ''), 
								layerKey: key.layerKey.replace(/LIVE_/, '').replace(/BKG/, 'NATIVE')
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
						const idx = ret.findIndex((lay) => {
							return lay['screenAuxKey'] === screen && lay['layerKey'] === layer
						})
						if (idx === -1) {
							ret.push({ screenAuxKey: screen, layerKey: layer })
						} else {
							ret.splice(idx, 1)
						}
					}
				} else {
					for (const layer of layers) {
						ret.push({ screenAuxKey: screen, layerKey: layer })
					}
				}
			}
			if (this.state.syncSelection) {
				// {"channel":"REMOTE","data":{"name":"replace","path":"/live/screens/layerSelection","args":[[{"screenAuxKey":"SCREEN_2","layerKey":"LIVE_1"}]]}}
				this.connection.sendWSdata('REMOTE', 'replace', '/live/screens/layerSelection', [
					ret.map((key: Key) => {
						return {
							screenAuxKey: this.choices.getScreenInfo(key.screenAuxKey).platformLongId, 
							layerKey: key.layerKey == 'NATIVE' ? 'BKG' : key.layerKey.replace(/(\d+)/, 'LIVE_$1')
						}
					})
				])
			} else {
				this.state.set('LOCAL/layerIds', ret)
				this.instance.checkFeedbacks('remoteLayerSelection')
			}
		}

		return selectLayer
	}

	/**
	 * MARK: Layer Selection (V3) - Midra
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

			type Key = Record<'screenAuxKey' | 'layerKey', string>
			let ret: Key[] = []
			if (action.options.mode !== 'exclusive') {
				if (this.state.syncSelection) {
					ret = this.state.get('REMOTE/live/screens/layerSelection/layerIds')
						.map((key: Key) => {
							return {
								screenAuxKey: key.screenAuxKey.replace(/(?<!^)\D/g, ''),
								layerKey: key.layerKey.replace(/LIVE_/, '').replace(/BKG/, 'NATIVE')
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
					const idx = ret.findIndex((lay) => {
						return lay['screenAuxKey'] === screen && lay['layerKey'] === layer
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
				// {"channel":"REMOTE","data":{"name":"replace","path":"/live/screens/layerSelection","args":[[{"screenAuxKey":"SCREEN_2","layerKey":"LIVE_1"}]]}}
				this.connection.sendWSdata('REMOTE', 'replace', '/live/screens/layerSelection', [
					ret.map((key: Key) => {
						return {
							screenAuxKey: this.choices.getScreenInfo(key.screenAuxKey).platformLongId,
							layerKey: key.layerKey == 'NATIVE' ? 'BKG' : key.layerKey.replace(/(\d+)/, 'LIVE_$1')
						}
					})
				])
			} else {
				this.state.set('LOCAL/layerIds', ret)
				this.instance.checkFeedbacks('remoteLayerSelection')
			}
			this.instance.checkFeedbacks('liveScreenSelection', 'remoteLayerSelection')
		}

		return selectLayerV3
	}

	// MARK: Stream Control - Midra
	get deviceStreamControl() {
		type DeviceStreamControl = {stream: string}
		
		const deviceStreamControl: AWJaction<DeviceStreamControl> = {
			name: 'LIVE - Stream Control',
			sortName: '01 LIVE - 15 Stream Control',
			description: 'Starts, stops, or toggles the device\'s streaming output.',
			options: [
				{
					type: 'dropdown',
					label: 'Action',
					id: 'stream',
					choices: [
						{ id: 'on', label: 'Start Stream'},
						{ id: 'off', label: 'Stop Stream'},
						{ id: 'toggle', label: 'Toggle Stream on/off'},
					],
					default: 'on',
				},
			],
			callback: (act) => {
				let action = act.options.stream
				if (action === 'toggle') {
					if (this.state.get('DEVICE/device/streaming/status/pp/mode') === 'NONE') action = 'on'
					else if (this.state.get('DEVICE/device/streaming/status/pp/mode') === 'LIVE') action = 'off'
					else {
						action = 'doNothing'
						this.instance.log('warn', 'Toggle stream on/off could not be sent because stream is neither running nor stopped (stream state: '+this.state.get('DEVICE/device/streaming/status/pp/mode')+')')
					}
				}
				if (action === 'on') {
					this.connection.sendWSmessage(['device','streaming','control','pp','start'], true)				
				}
				if (action === 'off') {
					this.connection.sendWSmessage(['device','streaming','control','pp','start'], false)				
				}
			}
		}

		return deviceStreamControl
	}

	// MARK: Stream Audio Mute - Midra
	get deviceStreamAudioMute() {
		type DeviceStreamAudioMute = {stream: string}
		
		const deviceStreamAudioMute: AWJaction<DeviceStreamAudioMute> = {
			name: 'Audio - Mute Stream',
			sortName: '06 Audio - Mute Stream',
			description: 'Mutes, unmutes, or toggles the audio of the device\'s streaming output.',
			options: [
				{
					type: 'dropdown',
					label: 'Action',
					id: 'stream',
					choices: [
						{ id: 'on', label: 'Unmute'},
						{ id: 'off', label: 'Mute'},
						{ id: 'toggle', label: 'Toggle'},
					],
					default: 'on',
				},
			],
			callback: (act) => {
				let action = act.options.stream
				if (action === 'toggle') {
					if (this.state.get('DEVICE/device/streaming/control/audio/live/pp/mute')) action = 'on'
					else action = 'off'
				}
				if (action === 'on') this.connection.sendWSmessage(['device','streaming','control','audio','live','pp','mute'], false)
				if (action === 'off') this.connection.sendWSmessage(['device','streaming','control','audio','live','pp','mute'], true)
			}
		}

		return deviceStreamAudioMute
	}

	/**
	 * MARK: Route audio block
	 */
	get deviceAudioRouteBlock() {
		type DeviceAudioRouteBlock = {device: number, out1: string, in1: string, out2?: string, in2?: string, out3?: string, in3?: string, out4?: string, in4?: string, blocksize: number}

		const audioOutputChoices =  this.choices.getAudioCustomBlockChoices()
		const audioInputChoices = this.choices.getAudioInputChoices()

		const deviceAudioRouteBlock: AWJaction<DeviceAudioRouteBlock> = {
			name: 'Audio - Route (Block)',
			sortName: '06 Audio - Route (Block)',
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
					tooltip: 'Capped at 8, and the block is additionally always clamped to end at the latest at the end of the 8-channel Custom Block it starts in (e.g. starting at Custom Block 1 Channel 7 only ever reaches channels 7-8, regardless of this setting) - a safety measure against accidentally spilling into the next Custom Block with a wrong setting. Use a second action for anything beyond that.',
					default: 8,
					min: 1,
					max: 8,
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
					// Never let the block spill past the end of the 8-channel Custom Block it starts in, no
					// matter what Block Size is set to - each output id is 'CUSTOM_n:channelNum' (1-8).
					const outChannelNum = parseInt(audioOutputChoices[outstart].id.toString().split(':')[1], 10)
					const remainingInOutputBlock = 8 - outChannelNum + 1
					const max = Math.min(
						audioOutputChoices.length - outstart,
						audioInputChoices.length - instart,
						action.options.blocksize,
						remainingInOutputBlock
					) // since 'None' is input at index 0 no extra test is needed, it is possible to fill all outputs with none
					const routings: Record<string, string[]> = {}
					for (let s = 0; s < max; s += 1) {
						const sink = audioOutputChoices[outstart + s].id
						const source = audioInputChoices[instart === 0 ? 0 : instart + s].id
						const block = sink.toString().split(':')[0]
						const channel = sink.toString().split(':')[1]
						if (!routings[block]) {
							routings[block] = [...(this.state.get('DEVICE/device/audio/custom/sourceList/items/' + block + '/control/pp/channelMapping') ?? [])] as string[]
						}
						routings[block][parseInt(channel) - 1] = source.toString()

					}
					Object.keys(routings).forEach((block) => {
						const path = [
							'device',
							'audio',
							'custom',
							'sourceList',
							'items',
							block,
							'control',
							'pp',
							'channelMapping',
						]
						this.connection.sendWSmessage(path, routings[block])
					})
				} else {
					console.error("%s can't be found in available outputs or %s can't be found in available inputs", action.options.out1, action.options.in1)
				}
			}
		}
		
		return deviceAudioRouteBlock
	}

	/**
	 * MARK: Route audio channels
	 */
	get deviceAudioRouteChannels() {
		type DeviceAudioRouteChannels = {device: number, out1: string, in1: string[], out2?: string, in2?: string[], out3?: string, in3?: string[], out4?: string, in4?: string[]}

		const audioOutputChoices =  this.choices.getAudioCustomBlockChoices()
		const audioInputChoices = this.choices.getAudioInputChoices()
		
		const deviceAudioRouteChannels: AWJaction<DeviceAudioRouteChannels> = {
			name: 'Audio - Route (Channels)',
			sortName: '06 Audio - Route (Channels)',
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
				let inputlist = ['NONE']
				if (action.options.in1?.length > 0) {
					inputlist = action.options.in1
				}
				const outstart = audioOutputChoices.findIndex((item) => {
					return item.id === action.options.out1
				})
				if (outstart > -1) {
					const max = Math.min(audioOutputChoices.length - outstart, inputlist.length)
					const routings: Record<string, string[]> = {}
					for (let s = 0; s < max; s += 1) {
						const sink = audioOutputChoices[outstart + s].id
						const source = inputlist[s]
						const block = sink.toString().split(':')[0]
						const channel = sink.toString().split(':')[1]
						if (!routings[block]) {
							routings[block] = [...(this.state.get('DEVICE/device/audio/custom/sourceList/items/' + block + '/control/pp/channelMapping') ?? [])] as string[]
						}
						routings[block][parseInt(channel) - 1] = source.toString()

					}
					Object.keys(routings).forEach((block: string) => {
						const path = [
							'device',
							'audio',
							'custom',
							'sourceList',
							'items',
							block,
							'control',
							'pp',
							'channelMapping',
						]
						this.connection.sendWSmessage(path, routings[block])
					})
				}
			}
		}

		return deviceAudioRouteChannels
	}

	/**
	 * MARK: Setup timer - Midra
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

		}

		// Color setup is not available at Midra
		deviceTimerSetup.options[4].isVisibleExpression = 'false'
		deviceTimerSetup.options[5].isVisibleExpression = 'false'

		return deviceTimerSetup
	}

	/**
	 * MARK: Choose Testpatterns - Midra
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
					{ id: 'outputList', label: 'Output' },
				],
				default: 'outputList',
				disableAutoExpression: true,
			},
			{
				id: 'screenList',
				type: 'dropdown',
				label: 'Screen',
				// id must be the plain screenList item key (e.g. "1"), not the "S1"-style id getScreenChoices()
				// returns elsewhere - device/screenList/items/{id}/... only recognizes the plain key.
				choices: this.choices.getScreensArray().map((s) => ({ id: s.id.replace(/^\D+/, ''), label: s.id })),
				default: this.choices.getScreensArray()[0]?.id.replace(/^\D+/, ''),
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
					{ id: 'VERTICAL_COLOR_BAR', label: 'Vertical Colorbars' },
					{ id: 'HORIZONTAL_COLOR_BAR', label: 'Horizontal Colorbars' },
					{ id: 'GRID_CUSTOM', label: 'Grid Custom' },
					{ id: 'SMPTE', label: 'SMPTE' },
					{ id: 'VERTICAL_GRADIENT', label: 'Vertical Gradient' },
					{ id: 'HORIZONTAL_GRADIENT', label: 'Horzontal Gradient' },
					{ id: 'CROSSHATCH', label: 'Crosshatch' },
					{ id: 'CHECKERBOARD', label: 'Checkerboard' },
					{ id: 'SOFTEDGE', label: 'Covering' },
					{ id: 'THIRTY_BPP_1', label: '30bit Testpattern #1' },
					{ id: 'THIRTY_BPP_2', label: '30bit Testpattern #2' },
				],
				default: 'NONE',
				isVisibleExpression: "$(options:group) == 'screenList'",
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
					{ id: 'CHECKERBOARD', label: 'Checkerboard' },
					{ id: 'SOFTEDGE', label: 'Covering' },
					{ id: 'PATHOLOGICAL', label: 'Pathological' },
				],
				default: 'NO_PATTERN',
				isVisibleExpression: "$(options:group) == 'outputList'",
				disableAutoExpression: true,
			},
		]

		return this.deviceTestpatterns_common(deviceTestpatternsOptions, 'Device - Set Midra 4K Testpattern')
	}

	/**
	 * MARK: Device Power
	 */
	get devicePower() {
		type DevicePower = {action : string}
		
		const devicePower: AWJaction<DevicePower> = {
			name: 'Device - Power',
			sortName: '08 Device - Power',
			description: 'Switches the device on (Wake on LAN), off, or reboots it.',
			options: [
				{
					id: 'action',
					type: 'dropdown',
					label: 'Power',
					choices: [
						{ id: 'on', label: 'Wake up from Standby' },
						{ id: 'standby', label: 'Switch to Standby' },
						{ id: 'off', label: 'Switch to Power off' },
						{ id: 'reboot', label: 'Reboot' },
					],
					default: 'on',
				},
			],
			callback: (action) => {
				const path = 'device/system/shutdown/standby/control/pp/xRequest'

				if (action.options.action === 'on' || action.options.action === 'wake') {
					this.connection.restPOST(this.instance.config.deviceaddr + '/api/tpp/v1/system/wakeup', '')
					this.connection.resetReconnectInterval()
				}
				if (action.options.action === 'standby') {
					this.connection.sendWSmessage(path, 'STANDBY')
					this.instance.updateStatus(InstanceStatus.Ok, 'Standby')
				}
				if (action.options.action === 'off') {
					this.connection.sendWSmessage(path, 'SWITCH_OFF')
				}
				if (action.options.action === 'reboot') {
					this.connection.sendWSmessage(['device','system','shutdown','pp','xReboot'], false, true)
				}
			}
		}

		return devicePower
	}

	/**
	 * MARK: Assign Image from Library to Foreground/Background Frame - Midra
	 */
	get deviceAssignImageLibraryToFrame() {
		type DeviceAssignImageLibraryToFrame = {screens: string[], frameType: string, slot: string, source: string}

		const libraryChoices = [{ id: 'NONE', label: 'None (clear)' }, ...this.choices.getStillLibraryChoices()]

		const deviceAssignImageLibraryToFrame: AWJaction<DeviceAssignImageLibraryToFrame> = {
			name: 'Preconfig - Assign Image from Library to Foreground/Background Frame',
			sortName: '07 Preconfig - Assign Image from Library to Foreground/Background Frame',
			description: 'Assigns an image from the Image Library to the Foreground or Background Frame (Midra only), so it becomes available as a Layer source.',
			options: [
				{
					id: 'screens',
					allowInvalidValues: true,
					type: 'multidropdown',
					label: 'Screen',
					choices: [{ id: 'sel', label: 'All Selected Screens' }, ...this.choices.getScreenChoices()],
					default: ['sel'],
				},
				{
					id: 'frameType',
					type: 'dropdown',
					label: 'Frame Type',
					choices: [
						{ id: 'topFrameList', label: 'Foreground / Logo' },
						{ id: 'backFrameList', label: 'Background' },
					],
					default: 'topFrameList',
				},
				{
					id: 'slot',
					type: 'dropdown',
					label: 'Frame Slot',
					choices: [1, 2, 3, 4].map((n) => ({ id: n.toString(), label: `Slot ${n}` })),
					default: '1',
				},
				{
					id: 'source',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Library Image',
					choices: libraryChoices,
					default: libraryChoices[0]?.id,
				},
			],
			callback: (action) => {
				const source = action.options.source
				if (!source) return
				const value = source === 'NONE' ? 'NONE' : Number(source)
				for (const screen of this.choices.getChosenScreens(action.options.screens)) {
					this.connection.sendWSmessage([
						'device', 'screenList', 'items', screen.replaceAll(/\D/g, ''),
						action.options.frameType, 'items', action.options.slot,
						'control', 'pp', 'librarySlot',
					], value)
				}
			},
		}

		return deviceAssignImageLibraryToFrame
	}


}
