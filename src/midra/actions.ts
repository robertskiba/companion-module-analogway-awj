import {AWJinstance} from '../index.js'

import {
	CompanionActionContext,
	CompanionActionEvent,
	CompanionInputFieldDropdown,
	SomeCompanionActionInputField,
} from '@companion-module/base'
import { InstanceStatus } from '@companion-module/base'
import Actions from '../awjdevice/actions.js'
import { parseBoolean, stripMemoryPrefix } from '../util.js'

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
		'deviceUpdatePreset',
		'deviceSaveScreenMemory',
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
		// 'deviceLayerCutFillV3', // Aquilon only for now - not yet live-verified on Midra (2026-09-08)
		'deviceLayerOpacityV3',
		'deviceLayerAspectCropV3',
		'deviceLayerMaskV3',
		'deviceLayerBorderV3',
		'deviceLayerEffectsV3',
		'deviceLayerSpeedV3',
		'deviceLayerTimingV3',
		'deviceLayerEncoderAdjustV3',
		// 'deviceSetAnchorPoint', // sets the global Anchor Point, which Midra does not have - see
		// dropGlobalAnchorChoice() below. The per-action anchor choices remain available.
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
		'deviceFailoverToHotBackup',
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
			const memory = stripMemoryPrefix(action.options.memory, 'SM')
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
					memory,
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
				this.connection.mirrorUnlockToBackup(screen, preset)
				this.connection.sendWSmessage(path,false, true)
				this.connection.mirrorToBackup(path, false, true)
				this.instance.sendXupdate()
				// No live Midra/Alta access this session to confirm an equivalent "isLoading" flag - fixed
				// delay for now, same reasoning as deviceAuxMemory/deviceMasterMemory above.
				await this.delay(200)

				if (parseBoolean(action.options.selectScreens)) {
					if (this.state.syncSelection) {
						this.connection.sendWSdata('REMOTE', 'replace', '/live/screens/screenAuxSelection', [screens])
					} else {
						this.state.set('LOCAL/screenAuxSelection/keys', screens)
						this.connection.mirrorSelectionToBackup(screens)
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
			const memory = stripMemoryPrefix(action.options.memory, 'AM')
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
					memory,
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
			const memorypath = ['items', stripMemoryPrefix(action.options.memory, 'MM')]
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
			for (const screen of screens) {
				this.connection.mirrorUnlockToBackup(screen, preset)
			}
			this.connection.sendWSmessage( fullpath, false, true )
			this.connection.mirrorToBackup(fullpath, false, true)
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
					this.connection.mirrorSelectionToBackup(screens)
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
				stripMemoryPrefix(action.options.memory, 'MV'),
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
					const path = ['device', 'transition', `${screeninfo.prefixverylong}List`, 'items', screeninfo.numstr, 'control', 'pp', 'xTake']
					this.connection.sendWSmessage(path, true)
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
				const path = [
					...(screen.startsWith('A') ? this.constants.auxGroupPath : this.constants.screenGroupPath),
					'items',
					screen.replaceAll(/\D/g, ''),
					'control',
					'pp',
					'xCut'
				]
				this.connection.sendWSmessage(path, true)
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
						this.connection.sendWSmessage([...presetpath, 'background', 'source', 'pp', 'content'], this.choices.shortSourceToBackgroundContent(action.options['sourceBack']))
					else
						// else decide which dropdown to use for which layer
						for (const layer of action.options[`layer${screen.id}`]) {
							if (layer === 'NATIVE' && action.options['sourceNative'] !== 'keep') {
								this.connection.sendWSmessage([...presetpath, 'background', 'source', 'pp', 'set'], action.options['sourceNative'].replace(/\D/g, ''))
							} else if (layer === 'TOP' && action.options['sourceFront'] !== 'keep') {
								this.connection.sendWSmessage([...presetpath, 'top', 'source', 'pp', 'frame'], action.options['sourceFront'].replace(/\D/g, ''))
							} else if ( action.options['sourceLayer'] !== 'keep') {
								this.connection.sendWSmessage([...presetpath, 'liveLayerList', 'items', layer, 'source', 'pp', 'input'], this.choices.shortSourceToBackgroundContent(action.options['sourceLayer']))
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
								this.connection.sendWSmessage([...presetpath, 'background', 'source', 'pp', 'content'], this.choices.shortSourceToBackgroundContent(action.options['sourceBack']))
							} else if (layer.layerKey === 'TOP' && action.options['sourceFront'] !== 'keep') {
								this.connection.sendWSmessage([...presetpath, 'top', 'source', 'pp', 'frame'], action.options['sourceFront'].replace(/\D/g, ''))
							} else if ( action.options['sourceLayer'] !== 'keep') {
								this.connection.sendWSmessage([...presetpath, 'liveLayerList', 'items', layer.layerKey, 'source', 'pp', 'input'], this.choices.shortSourceToBackgroundContent(action.options['sourceLayer']))
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
				choices: [{ id: 'keep', label: "Don't change source"}, ...this.choices.getSourceChoices().map((c) => ({ id: this.choices.backgroundContentToShortSource(c.id), label: c.label }))],
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
				label: 'Foreground Source',
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
				label: 'Background Source (Aux)',
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
				{ id: 'all', label: 'All Layers' },
				{ id: 'sel', label: 'All Selected Layers' },
				...this.choices.getLayerChoices(this.choices.getMaxConfiguredLayerCount(), true, true),
			]
		}

		// One "Source" field drives every target type, so which of the device's three differently-named
		// properties gets written is decided purely by the Layer/Screen selection, not by asking the user to
		// fill the matching one of several parallel fields. The id spaces are disjoint - NONE, COLOR, IN{n},
		// NATIVE_{n} (Background Set) and TOP_{n} (Foreground Image) - so a single list stays unambiguous, and
		// the callback ignores any pick that isn't valid for the resolved target, the same way an invalid pick
		// on a Screen's background layer has always been a no-op.
		const sourceField = deviceSelectSourceV3.options.find((opt) => opt.id === 'sourceLayer')
		if (sourceField) {
			// Foreground Images sit directly in front of the Background Sets, so the list reads front-to-back:
			// inputs, then foreground, then background. 'NONE' is dropped from the foreground list because the
			// shared one already starts with it.
			const foreground = this.choices.choicesForegroundImagesSource.filter((c) => c.id !== 'NONE')
			const choices = [...sourceField['choices']]
			const firstBackgroundSet = choices.findIndex((c: { id: string | number }) => /^NATIVE_\d+$/.test(String(c.id)))
			choices.splice(firstBackgroundSet === -1 ? choices.length : firstBackgroundSet, 0, ...foreground)
			// A Screen's own Program output can be re-inserted into an Aux background, so every configured
			// Screen is offered too - right at the end, because it is valid for exactly one target (an Aux
			// background) while everything above it applies to the far more common Screen targets. The V2
			// action's Aux field has always offered these; the V3 one simply never carried them over.
			choices.push(...this.choices.getScreensArray().map((screen) => ({
				id: `PROGRAM_${screen.index}`,
				label: `${screen.id} PGM${screen.label === '' ? '' : ' - ' + screen.label}`,
			})))
			sourceField['choices'] = choices
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
			if (opt.layer === 'all') {
				return targetScreens.flatMap(screenAuxKey => this.choices.getLayersAsArray(screenAuxKey, true).map(l => ({screenAuxKey, layerKey: this.choices.normalizeLayerId(l.id)})))
			}
			// Expression Mode also accepts a concatenated multi-Layer string like 'L1L2' (getChosenLayers() -
			// same convention as "LIVE - Layer Selection"/"LIVE - Layer Freeze" elsewhere in the module; 'BG' is
			// already converted to 'NATIVE' by getChosenLayers() itself, 'TOP' passes through unchanged since it
			// isn't part of that shared token vocabulary) - a plain value from the dropdown passes through
			// unchanged. Only a Layer that actually exists on that specific Screen right now is targeted, per
			// Screen (see GUIDELINES.md's "never write to a target that doesn't exist").
			const layerKeys = this.choices.getChosenLayers(opt.layer)
			return targetScreens.flatMap(screenAuxKey => {
				const realIds = new Set(this.choices.getLayersAsArray(screenAuxKey, true).map(l => this.choices.normalizeLayerId(l.id)))
				return layerKeys.filter(k => realIds.has(k)).map(layerKey => ({screenAuxKey, layerKey}))
			})
		}

		// "Get current values" (Companion's standard blue "Learn" button) - reads the first resolved layer's
		// current source and pins screen/preset/layer to the concrete values it read from.
		deviceSelectSourceV3.learn = (action) => {
			const targets = resolveTargets(action.options)
			if (targets.length === 0) return undefined
			const target = targets[0]
			const screen = this.choices.getScreenInfo(target.screenAuxKey)

			// getPresetSelection() returns 'pvw', but the "Preset" option's own choices use 'prw' for Preview -
			// convert before writing it into an option value (see the same fix in awjdevice/actions.ts's learn
			// handlers).
			const preset = this.choices.getPresetSelection().replace('pvw', 'prw')
			const presetpath = [
				'device',
				screen.prefixverylong + 'List',
				'items', screen.platformId,
				'presetList', 'items', this.choices.getPreset(screen.id, preset)
			]

			const newoptions: Partial<typeof action.options> & {sourceFront?: string} = {
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
				// An Aux background is read back into the shared "Source" field, matching where the callback
				// now takes it from - converted to this module's short id (INPUT_2 -> IN2) like every other
				// source, so Learn produces a value the dropdown actually contains.
				const raw = this.state.get(['DEVICE', ...presetpath, 'background', 'source', 'pp', 'content'])
				if (typeof raw !== 'string') return newoptions
				if (raw === 'NONE') {
					// Same NONE-vs-COLOR disambiguation as the Screen background below: `content` has no COLOR
					// value, so Color is stored as "no source plus a colour" and the two are told apart by the
					// colour itself - the callback always forces black for None.
					const backgroundColor = readColor([...presetpath, 'background', 'color', 'pp'])
					newoptions.sourceLayer = backgroundColor === 0 ? 'NONE' : 'COLOR'
					if (backgroundColor !== 0) newoptions.sourceColor = backgroundColor
					return newoptions
				}
				// PROGRAM_{n} (a Screen's re-inserted Program) is already the id the dropdown offers and passes
				// through backgroundContentToShortSource() unchanged; an input becomes IN{n} like everywhere else.
				newoptions.sourceLayer = this.choices.backgroundContentToShortSource(raw)
				return newoptions
			}

			if (target.layerKey === 'TOP') {
				// Stored as the bare digit ("3") or "NONE" - mapped back to the TOP_{n} id the shared "Source"
				// dropdown offers, mirroring what the callback sends in the other direction.
				const raw = this.state.get(['DEVICE', ...presetpath, 'top', 'source', 'pp', 'frame'])
				if (raw !== undefined) newoptions.sourceLayer = /^\d+$/.test(String(raw)) ? `TOP_${raw}` : String(raw)
				return newoptions
			}

			if (target.layerKey === 'NATIVE' || target.layerKey === 'BKG') {
				const raw = this.state.get(['DEVICE', ...presetpath, 'background', 'source', 'pp', 'set'])
				if (typeof raw !== 'string') return newoptions
				// background layers store just the bare digit ("3"), not "NATIVE_3" - same reverse mapping the
				// callback's own `source.replace(/\D/g, '')` does in the other direction. Otherwise convert the
				// raw AWJ id (e.g. STILL_3) to this module's own short id (IMG3) - backgroundContentToShortSource()
				// passes anything else (NONE/COLOR) through unchanged.
				if (/^\d+$/.test(raw)) {
					newoptions.sourceLayer = `NATIVE_${raw}`
					return newoptions
				}
				// `set` is NONE for both "None" and "Color", since Color is expressed as "no Background Set plus
				// a colour" (see the callback). The two are told apart by the colour itself: the callback always
				// forces black for None, so anything else was a deliberate Color pick.
				const backgroundColor = readColor([...presetpath, 'background', 'color', 'pp'])
				newoptions.sourceLayer = backgroundColor === 0 ? 'NONE' : 'COLOR'
				if (backgroundColor !== 0) newoptions.sourceColor = backgroundColor
				return newoptions
			}

			const raw = this.state.get(['DEVICE', ...presetpath, 'liveLayerList', 'items', target.layerKey, 'source', 'pp', 'input'])
			if (typeof raw === 'string') {
				newoptions.sourceLayer = this.choices.backgroundContentToShortSource(raw)
				if (raw === 'COLOR') newoptions.sourceColor = readColor([...presetpath, 'liveLayerList', 'items', target.layerKey, 'color', 'pp'])
			}
			return newoptions
		}

		deviceSelectSourceV3.callback = (action) => {
			// 'all' (Both) isn't a real preset bank - getPreset()/isLocked() only understand pgm/prw/A/B/sel,
			// so it's expanded into an explicit list up front rather than passed through.
			const presetsToApply = action.options.preset === 'all' ? ['pgm', 'prw'] : [action.options.preset]
			const targets = resolveTargets(action.options)
			for (const preset of presetsToApply) {
				for (const target of targets) {
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
					// On Midra an Aux screen only has a background - no per-layer addressing at all - so the Layer
					// field is irrelevant here and the shared "Source" field drives it, exactly like every other
					// target type. `content` takes an input, a Screen's Program re-insertion, or NONE; Background
					// Sets and Foreground Images are not valid here and are ignored rather than sent, the same way
					// an invalid pick on a Screen's background layer is a no-op below.
					if (screen.isAux) {
						const source = this.choices.shortSourceToBackgroundContent(action.options['sourceLayer'])
						// Same shape as the Screen background below: `content` has no COLOR value of its own, so
						// the picked colour only becomes visible once the source is cleared - Color is therefore
						// sent as NONE plus the colour, and plain None resets the colour to black.
						const colorpath = [...presetpath, 'background', 'color', 'pp']
						const sendColor = (r: number, g: number, b: number) => {
							this.connection.sendWSmessage([...colorpath, 'red'], r)
							this.connection.sendWSmessage([...colorpath, 'green'], g)
							this.connection.sendWSmessage([...colorpath, 'blue'], b)
						}
						if (action.options['sourceLayer'] === 'keep') {
							// nothing to do
						} else if (source === 'NONE') {
							this.connection.sendWSmessage([...presetpath, 'background', 'source', 'pp', 'content'], 'NONE')
							sendColor(0, 0, 0)
						} else if (source === 'COLOR') {
							this.connection.sendWSmessage([...presetpath, 'background', 'source', 'pp', 'content'], 'NONE')
							const color = Number(action.options['sourceColor'])
							sendColor((color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff)
						} else if (/^INPUT_\d+$/.test(source) || /^PROGRAM_\d+$/.test(source)) {
							this.connection.sendWSmessage([...presetpath, 'background', 'source', 'pp', 'content'], source)
						}
					} else if (target.layerKey === 'NATIVE' || target.layerKey === 'BKG') {
						// Converts this module's own short id (IN{n}/IMG{n}) back to the raw AWJ id (LIVE_n/STILL_n)
						// the device expects - anything else (NONE/COLOR/NATIVE_n, or an already-raw id typed
						// directly via Expression Mode) passes through unchanged.
						const source = this.choices.shortSourceToBackgroundContent(action.options['sourceLayer'])
						// Live-verified against an Eikos 4K simulator: on Midra the colour is a sibling of `source`
						// (background/color/pp/{red,green,blue}), NOT nested under it the way LivePremier4 has it
						// at layerList/items/NATIVE/source/color/pp. The previous path assumed LivePremier's shape
						// and wrote into a node that does not exist here.
						const colorpath = [...presetpath, 'background', 'color', 'pp']
						const sendColor = (r: number, g: number, b: number) => {
							this.connection.sendWSmessage([...colorpath, 'red'], r)
							this.connection.sendWSmessage([...colorpath, 'green'], g)
							this.connection.sendWSmessage([...colorpath, 'blue'], b)
						}
						if (source === 'NONE') {
							this.connection.sendWSmessage([...presetpath, 'background', 'source', 'pp', 'set'], 'NONE')
							sendColor(0, 0, 0) // "None" always resets the background to black, regardless of the color picker
						} else if (source === 'COLOR') {
							// `set` selects a Background Set and has no "COLOR" value of its own - the picked colour
							// only becomes visible once the Background Set is cleared, so Color is sent as NONE plus
							// the colour.
							// Deliberately NOT the same as LivePremier4, where the background is a normal layer and
							// its `source/pp/inputNum` does accept 'COLOR' directly (live-confirmed working on an
							// Aquilon). The two platforms genuinely differ here - do not "harmonise" them.
							this.connection.sendWSmessage([...presetpath, 'background', 'source', 'pp', 'set'], 'NONE')
							const color = Number(action.options['sourceColor'])
							sendColor((color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff)
						} else if (/^NATIVE_\d+$/.test(source)) {
							this.connection.sendWSmessage([...presetpath, 'background', 'source', 'pp', 'set'], source.replace(/\D/g, ''))
						}
						// anything else picked from the shared list isn't valid for a background layer - no-op
					} else if (target.layerKey === 'TOP') {
						// The foreground frame holds a Foreground Image (TOP_{n}, sent as the bare digit) or NONE -
						// inputs, Color and Background Sets are not valid here and are ignored rather than sent.
						const picked = this.choices.normalizeSourceId(action.options['sourceLayer'])
						if (picked === 'NONE') {
							this.connection.sendWSmessage([...presetpath, 'top', 'source', 'pp', 'frame'], 'NONE')
						} else if (/^TOP_\d+$/.test(picked)) {
							this.connection.sendWSmessage([...presetpath, 'top', 'source', 'pp', 'frame'], picked.replace(/\D/g, ''))
						}
					} else if (action.options['sourceLayer'] !== 'keep') {
						const source = this.choices.shortSourceToBackgroundContent(action.options['sourceLayer'])
						// A numbered layer takes an input, Color or None - Background Sets and Foreground Images
						// belong to the background/foreground layers and are ignored here rather than sent.
						// Deliberately not an early `continue`: the relock below has to run either way, or a
						// screen this action unlocked itself would silently stay unlocked.
						if (source === 'NONE' || source === 'COLOR' || /^INPUT_\d+$/.test(source)) {
							this.connection.sendWSmessage([...presetpath, 'liveLayerList', 'items', target.layerKey, 'source', 'pp', 'input'], source)
							if (source === 'COLOR') {
								const color = Number(action.options['sourceColor'])
								// Sibling of `source`, not nested under it - same Midra shape as the background above.
							const colorpath = [...presetpath, 'liveLayerList', 'items', target.layerKey, 'color', 'pp']
								this.connection.sendWSmessage([...colorpath, 'red'], (color >> 16) & 0xff)
								this.connection.sendWSmessage([...colorpath, 'green'], (color >> 8) & 0xff)
								this.connection.sendWSmessage([...colorpath, 'blue'], color & 0xff)
							}
						}
					}
					if (unlockedByUs && parseBoolean(action.options.relockAfterChange)) {
						this.choices.setScreenLock(screen.id, preset, true)
					}
				}
			}
			this.instance.sendXupdate()
		}

		return deviceSelectSourceV3
	}


	/**
	 * MARK: Set input keying
	 */
	get deviceInputKeying() {
		const deviceInputKeying = super.deviceInputKeying

		// CremaTTe3D is an Aquilon-only keying system and does not exist here at all, so it is dropped rather
		// than left in the list to be silently ignored - same treatment as "Wipe 2" and the Speed Linear switch.
		// Cut&Fill loses its inherited firmware gate: that gate names an Aquilon version (4.0.254), and Midra's
		// firmware is numbered in a completely different series, so isFirmwareAtLeast() can never be true and
		// the mode was blocked outright on every Midra. The device answers the question directly instead, per
		// input - see the callback below.
		const modeField = deviceInputKeying.options.find((opt) => opt.id === 'mode')
		if (modeField) {
			modeField['choices'] = [
				{ id: 'DISABLE', label: 'Keying Disabled' },
				{ id: 'CHROMA', label: 'Chroma Key' },
				{ id: 'LUMA', label: 'Luma Key' },
				{
					id: 'CUT_AND_FILL',
					// Midra's own version, not Aquilon's 4.0.254 - Analog Way's Midra 4K release note lists it under
					// firmware 3.2.29 (17 July 2024), wording the pairing exactly as the device behaves: "The odd
					// inputs are related to the content and the Cut source is the following inputs (even)". The note
					// is on the label only; what actually blocks the write is the device's own per-input capability
					// flag, which is live and knows which inputs can do it.
					label: this.choices.isPlatformFirmwareAtLeast('3.2.29')
						? 'Cut&Fill (odd-numbered Inputs only)'
						: 'Cut&Fill (odd-numbered Inputs only, requires at least firmware 3.2.29)',
				},
			]
		}

		deviceInputKeying.callback = (action) => {
			// The dropdown's own choices (inherited unchanged from the base action) use this module's short
			// 'IN{n}' convention (e.g. 'IN3', no underscore) - a plain '.replace(\'IN_\', \'INPUT_\')' never
			// matched that (only the old V2-style 'IN_3'), so a fresh, untouched dropdown selection silently
			// targeted a nonexistent 'IN3' state path instead of Midra's real 'INPUT_3'. Same lenient
			// bare-number/'IN{n}'/'IN_{n}' extraction the Aquilon version of this action already uses.
			const match = (action.options.input ?? '').match(/^(?:IN(?:PUT)?_?)?(\d+)$/i)
			if (!match) return
			const input = `INPUT_${match[1]}`
			// Cut&Fill pairs two inputs: the odd-numbered one carries the Fill and the even one that follows it
			// automatically becomes the Cut, so only an odd input can be switched into the mode. The device says
			// so itself per input, which is what this asks rather than inferring it from the number - live-
			// confirmed on an Eikos 4K simulator, where status/keying/cutNFill/pp/isAvailable is true for Inputs
			// 1, 3, 5, 7 and 9 and false for 2, 4, 6, 8 and 10, and each odd input's cutNFill source already
			// names its own even partner (INPUT_1 -> INPUT_2, and so on).
			//
			// Deliberately not the inherited firmware gate: that names an Aquilon version, which Midra's own
			// numbering can never satisfy, so it blocked the mode on every Midra regardless of the hardware.
			// The neighbouring flag status/keying/pp/isAvailable is NOT a usable gate for Chroma/Luma - it reads
			// false on every input here, including one actively set to LUMA.
			if (
				action.options.mode === 'CUT_AND_FILL' &&
				this.state.get(['DEVICE', 'device', 'inputList', 'items', input, 'status', 'keying', 'cutNFill', 'pp', 'isAvailable']) !== true
			) return
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
			// Same fix as deviceInputKeying above - the dropdown's own choices use the short 'IN{n}' convention
			// (e.g. 'IN3'), which a plain '.replace(\'IN_\', \'INPUT_\')' never matched, silently targeting a
			// nonexistent 'IN3' state path instead of Midra's real 'INPUT_3'.
			const match = (action.options.input ?? '').match(/^(?:IN(?:PUT)?_?)?(\d+)$/i)
			if (!match) return
			const input = `INPUT_${match[1]}`
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
			name: 'Preconfig - Set Input Plug (Midra/Alta)',
			sortName: '06 Preconfig - Set Input Plug',
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
	/**
	 * MARK: Layer Properties - Speed - Midra
	 *
	 * Midra has no Linear/Smooth speed switch: WebRCS only offers Pt1/Pt2 there, and the device stores
	 * `speed/pp/type` as plain 'SMOOTH' rather than LivePremier's 'SMOOTH_TRANSITION'/'LINEAR_TRANSITION'
	 * enum, so the base action's value would not be understood anyway. The field is removed rather than
	 * left visible and inert, and the callback's own 'keep' default means nothing is ever sent for it.
	 */
	get deviceLayerSpeedV3() {
		const deviceLayerSpeedV3 = super.deviceLayerSpeedV3

		const linearIndex = deviceLayerSpeedV3.options.findIndex((opt) => opt.id === 'linear')
		if (linearIndex !== -1) deviceLayerSpeedV3.options.splice(linearIndex, 1)

		// Linear sat between the plain target separator and the labelled "Acceleration" heading, so removing it
		// leaves two rules back to back. Drops the unlabelled one and keeps the heading.
		const targetHeaderIndex = deviceLayerSpeedV3.options.findIndex((opt) => opt.id === 'targetHeader')
		if (targetHeaderIndex !== -1) deviceLayerSpeedV3.options.splice(targetHeaderIndex, 1)

		return deviceLayerSpeedV3
	}

	/**
	 * Midra has no global Anchor Point - its REMOTE snapshot carries no live/screens/layers node at all, and
	 * positions are always stored relative to the centre. "Use Global Anchor Point" would therefore refer to
	 * a setting that does not exist, so it is dropped and the field defaults to Center instead.
	 *
	 * The remaining anchor choices deliberately stay: converting a corner-relative position into the centre-
	 * relative value the device stores is done by this module, not by the device, so it works here just as
	 * well - and offers something WebRCS itself does not.
	 */
	private dropGlobalAnchorChoice(options: { id?: string }[]): void {
		const anchor = options.find((opt) => opt.id === 'anchor') as { choices?: { id: string | number }[], default?: unknown } | undefined
		if (!anchor?.choices) return
		anchor.choices = anchor.choices.filter((choice) => choice.id !== 'sel')
		if (anchor.default === 'sel') anchor.default = 'CENTER'
	}

	get devicePositionSizeV3() {
		const devicePositionSizeV3 = super.devicePositionSizeV3

		this.dropGlobalAnchorChoice(devicePositionSizeV3.options)

		// The Foreground frame can be moved but not resized - it has a position node and no size node at all
		// (live-confirmed on an Eikos 4K simulator). The size fields stay visible because Companion cannot
		// hide them based on another field's value, so the note explains why they do nothing there; the
		// callback skips those writes via choices.layerSupports(..., 'size').
		devicePositionSizeV3.options.push({
			id: 'foregroundSizeNote',
			type: 'static-text',
			label: '',
			value: '---\nNote: the **Foreground** layer can be positioned, but not resized - the size fields above are ignored for it.',
			disableAutoExpression: true,
		} as any)

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
	 * MARK: Save/Revert Screen Memory Changes - Midra
	 *
	 * The WebRCS function behind the memory number in the editor's corner: a memory is loaded into a preset,
	 * something gets changed, and the change is either written back into that memory or thrown away. Covers
	 * Screens and Auxes alike, matching what this action already does on LivePremier.
	 *
	 * Read off the wire on an Eikos 4K simulator (2026-09-22), both banks separately. Saving turned out to be
	 * **the same command** as saving to a slot - there is no separate update command - just aimed at whichever
	 * slot is currently loaded:
	 *   device/preset/{bank|auxBank}/control/save/{screenList|auxiliaryScreenList}/items/{screen}
	 *     /presetList/items/{PROGRAM|PREVIEW}/slotList/items/{slot}/pp/xRequest
	 *
	 * Reverting was never captured, on either bank, so it is done by reloading the same memory - which is what
	 * restoring the saved state means and gives the identical result whatever WebRCS does internally. Verified
	 * working that way. Note the load command nests the other way round, slot first:
	 *   device/preset/{bank|auxBank}/control/load/slotList/items/{slot}
	 *     /{screenList|auxiliaryScreenList}/items/{screen}/presetList/items/{PROGRAM|PREVIEW}/pp/xRequest
	 *
	 * Screens and Auxes use entirely separate banks and address their own list, but are otherwise identical.
	 * Both forms of the preset key are needed and they are not interchangeable: the command paths take the
	 * logical PROGRAM/PREVIEW, while the loaded slot number is read from the screen's own physical UP/DOWN
	 * bank.
	 */
	get deviceUpdatePreset() {
		const deviceUpdatePreset = super.deviceUpdatePreset

		deviceUpdatePreset.options[0]['label'] = 'Screen / Aux'
		deviceUpdatePreset.options[0]['choices'] = [
			{ id: 'first', label: 'First/Only Selected Screen' },
			{ id: 'all', label: 'All Screens' },
			{ id: 'sel', label: 'All Selected Screens' },
			...this.choices.getScreenAuxChoices(),
		]
		deviceUpdatePreset.options[0]['tooltip'] = 'Screens and Auxes are treated the same here, each going to its own memory bank - so "All Screens" and "All Selected Screens" cover both. A target with no memory loaded on the chosen preset is skipped.'

		deviceUpdatePreset.callback = (action) => {
			const screens = action.options.screens === 'first'
				? this.choices.getSelectedScreens().slice(0, 1)
				: action.options.screens === 'sel'
					? this.choices.getSelectedScreens()
					: this.choices.getChosenScreenAuxes(action.options.screens)

			return this.instance.serialize(screens, async () => {
				const preset = this.choices.getPresetSelection(action.options.preset, true)
				const unlockedScreens = new Set<string>()
				const waitPromises: Promise<boolean>[] = []

				for (const screen of screens) {
					const screeninfo = this.choices.getScreenInfo(screen)
					const platformId = screeninfo.platformId
					// Screens and Auxes have entirely separate memory banks here, each addressing its own list -
					// live-confirmed on the wire for both. Everything else about the two is identical.
					const bank = screeninfo.isAux ? 'auxBank' : 'bank'
					const listKey = screeninfo.isAux ? 'auxiliaryScreenList' : 'screenList'
					// The physical bank key, not the logical one the commands use - this is where the device
					// reports which memory is loaded and whether it has unsaved changes.
					const bankKey = this.choices.getPreset(screen, action.options.preset)
					const statusPath = ['DEVICE', 'device', listKey, 'items', platformId, 'presetList', 'items', bankKey, 'status', 'pp']
					const slot = this.state.get([...statusPath, 'memoryId'])
					// 0 means no memory is loaded into this preset, so there is nothing to save or revert.
					if (!slot) continue

					if (this.choices.isLocked(screen, preset)) {
						if (!parseBoolean(action.options.unlockIfLocked)) continue
						if (!unlockedScreens.has(screen)) {
							this.choices.setScreenLock(screen, preset, false)
							unlockedScreens.add(screen)
						}
					}

					const path = action.options.mode === 'revert'
						? ['device', 'preset', bank, 'control', 'load', 'slotList', 'items', String(slot), listKey, 'items', platformId, 'presetList', 'items', preset, 'pp', 'xRequest']
						: ['device', 'preset', bank, 'control', 'save', listKey, 'items', platformId, 'presetList', 'items', preset, 'slotList', 'items', String(slot), 'pp', 'xRequest']
					this.connection.sendWSmessage(path, false, true)
					// Both operations end with the preset no longer carrying unsaved changes, which is the thing
					// the user is actually waiting for - and the one signal that reads the same either way.
					waitPromises.push(this.waitForStateValue([...statusPath, 'isModified'], (v) => v === false))
					this.instance.sendXupdate()
				}

				await Promise.all(waitPromises)
				if (parseBoolean(action.options.relockAfterChange)) {
					for (const screen of unlockedScreens) {
						this.choices.setScreenLock(screen, preset, true)
					}
				}
			})
		}

		return deviceUpdatePreset
	}

	/**
	 * MARK: Save Screen Memory to Slot - Midra
	 *
	 * Read off the wire on an Eikos 4K simulator (2026-09-22) by watching the websocket while a Screen Memory
	 * was saved, relabelled and deleted in WebRCS, because the REST snapshot does not carry these write-only
	 * command nodes at all - `control/save/screenList/items/{n}/presetList` shows an empty `items` until it is
	 * actually used, so its absence proved nothing.
	 *
	 * Saving is one pulse:
	 *   device/preset/bank/control/save/screenList/items/{screen}/presetList/items/{PROGRAM|PREVIEW}
	 *     /slotList/items/{slot}/pp/xRequest = true
	 *
	 * Two details differ from Aquilon beyond the bank root. The screen is keyed by its bare number, like every
	 * other Midra list, and the preset segment is the *logical* PROGRAM/PREVIEW - not the UP/DOWN key that
	 * getPreset() returns for this platform, which addresses the physical bank and would be wrong here.
	 *
	 * Screens only: Midra keeps Aux memories in a separate `auxBank` with its own save path, so an Aux is not
	 * a valid target for this one at all and is left out of the dropdown rather than silently doing nothing.
	 */
	get deviceSaveScreenMemory() {
		const deviceSaveScreenMemory = super.deviceSaveScreenMemory

		deviceSaveScreenMemory.name = 'LIVE - Save Screen/Aux Memory to Slot (+ edit label/delete Memory)'
		deviceSaveScreenMemory.options[0]['label'] = 'Screen / Aux'
		deviceSaveScreenMemory.options[0]['choices'] = [{ id: 'first', label: 'First/Only Selected Screen' }, ...this.choices.getScreenAuxChoices()]
		deviceSaveScreenMemory.options[0]['tooltip'] = 'A memory always holds exactly one Screen\'s or Aux\'s state, so there is no multi-selection here, unlike Recall - an expression resolving to several uses the first one. Which memory bank is written follows from this choice: a Screen goes to the Screen Memories, an Aux to the separate Aux Memories.'

		// Screens and Auxes have separate 200-slot banks, so they get a dropdown each rather than one merged
		// 400-entry list, with only the relevant one shown. Visibility follows the Screen/Aux field, which can
		// only be judged statically when it names a concrete target - with "First/Only Selected Screen" either
		// is possible, so both stay visible and the callback picks the bank from the target it actually
		// resolves. That resolution is the authority either way; this is only about keeping the form tidy.
		const bankNote = ' Screens and Auxes use entirely separate memory banks on this platform, so a Screen is always saved into a Screen Memory and an Aux into an Aux Memory - whichever of the two fields matches your Screen/Aux choice above is the one that applies.'
		const memoryField = deviceSaveScreenMemory.options.find((opt) => opt.id === 'memory') as CompanionInputFieldDropdown | undefined
		if (memoryField) {
			memoryField.label = 'Screen Memory'
			memoryField.tooltip = 'Only used when the target is a Screen.' + bankNote
			memoryField.isVisibleExpression = "indexOf($(options:screens), 'A') != 0"
		}
		const auxMemoryField: CompanionInputFieldDropdown = {
			id: 'memoryAux',
			allowInvalidValues: true,
			type: 'dropdown',
			label: 'Aux Memory',
			tooltip: 'Only used when the target is an Aux.' + bankNote,
			choices: [{ id: 'next', label: 'Next Available (first empty slot)' }, ...this.choices.getAllAuxMemorySlotChoices()],
			default: 'next',
			isVisibleExpression: "indexOf($(options:screens), 'A') == 0 || $(options:screens) == 'first'",
		}
		deviceSaveScreenMemory.options.splice(deviceSaveScreenMemory.options.indexOf(memoryField as never) + 1, 0, auxMemoryField)

		deviceSaveScreenMemory.callback = (action) => {
			// Serialized on the slot (two buttons racing for the same one) and, for a save, on the source
			// screen too - same reasoning as the Aquilon version. Relabel and delete touch no live Screen.
			const screen = action.options.action === 'save'
				? (action.options.screens === 'first' ? this.choices.getSelectedScreens() : this.choices.getChosenScreenAuxes(action.options.screens))[0]
				: undefined
			if (action.options.action === 'save' && !screen) return Promise.resolve()

			// The bank follows the resolved target, which is the thing that cannot be wrong. Relabel and delete
			// have no target at all - they act on the bank alone - so there the Aux field decides: it is only
			// visible when an Aux is, or could be, chosen, and its slot is taken whenever it names one.
			// memoryAux is this platform's own extra field, not part of the shared action's option type.
			const options = action.options as typeof action.options & { memoryAux?: string }
			const auxChosen = String(options.memoryAux ?? '')
			const isAux = screen !== undefined
				? this.choices.getScreenInfo(screen).isAux
				: auxChosen !== '' && auxChosen !== 'next' && String(action.options.screens ?? '').startsWith('A')

			const kind = isAux ? 'Aux' : 'Screen'
			const chosen = String((isAux ? options.memoryAux : options.memory) ?? '')
			const slot = chosen === 'next'
				? (isAux ? this.choices.getNextAvailableAuxMemorySlot() : this.choices.getNextAvailableScreenMemorySlot())
				: stripMemoryPrefix(chosen, isAux ? 'AM' : 'SM')
			if (!slot) return Promise.resolve()

			const keys = [`${isAux ? 'AM' : 'SM'}:${slot}`, ...(screen ? [screen] : [])]

			return this.instance.serialize(keys, async () => {
				const alreadyValid = (isAux ? this.choices.getAuxMemoryArray() : this.choices.getScreenMemoryArray()).some((mem) => mem.id === slot)
				// Says so in the log rather than just returning: the guard covers relabel and delete as well as
				// save, so with it unchecked those two do nothing on any slot that has content - which is every
				// slot worth relabelling. Silently doing nothing is what makes that expensive to work out.
				if (alreadyValid && !parseBoolean(action.options.allowExisting)) {
					this.instance.log('info', `${kind} Memory ${slot} already has content - not touching it. Tick "Allow save, update or delete of existing Screen Memory?" on this action to act on a slot that is in use.`)
					return
				}

				// The two banks are the same shape, one level apart - live-confirmed on the wire for both.
				const bankPath = isAux ? ['device', 'preset', 'auxBank', 'slotList'] : [...this.constants.screenMemoryPath]
				const slotPath = [...bankPath, 'items', String(slot)]
				const bankItemPath = [...slotPath, 'control', 'pp']
				const bankValidPath = ['DEVICE', ...slotPath, 'status', 'pp', 'isValid']

				if (action.options.action === 'delete') {
					// Not captured on the wire - that session produced two relabels and no delete - so this follows
					// the Aquilon version's false-then-true pulse, how every other x-command here is sent.
					// Verified working against the simulator afterwards.
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

				if (!screen) return
				const preset = this.choices.getPresetSelection(action.options.preset, true)
				this.connection.sendWSmessage(
					[
						'device', 'preset', isAux ? 'auxBank' : 'bank', 'control', 'save',
						isAux ? 'auxiliaryScreenList' : 'screenList', 'items', this.choices.getScreenInfo(screen).platformId,
						'presetList', 'items', preset,
						'slotList', 'items', String(slot),
						'pp', 'xRequest',
					],
					// false first, then true: this is an edge-triggered command, and the node keeps whatever it was
					// last set to. Sending a bare `true` works exactly once - the second save into the same slot
					// and preset writes true over true, the device sees no edge, and nothing happens at all. The
					// capture shows WebRCS doing the same: its first save was a plain true, every one after it
					// false then true.
					false, true
				)

				// A typed label always applies. Midra does not invent one of its own when saving into an empty
				// slot - watching the wire, no label was written at all until it was set by hand - so the same
				// generated fallback the Aquilon version uses is applied here, from the device's own clock
				// rather than the Companion host's. That clock sits under system/rtc/cmd/pp here, not
				// system/rtc/status/pp.
				if (action.options.label !== '') {
					this.connection.sendWSmessage([...bankItemPath, 'label'], action.options.label)
				} else if (!alreadyValid) {
					const pad = (n: number) => String(n).padStart(2, '0')
					const monthAbbrev: Record<string, string> = {
						JANUARY: 'Jan', FEBRUARY: 'Feb', MARCH: 'Mar', APRIL: 'Apr', MAY: 'May', JUNE: 'Jun',
						JULY: 'Jul', AUGUST: 'Aug', SEPTEMBER: 'Sep', OCTOBER: 'Oct', NOVEMBER: 'Nov', DECEMBER: 'Dec',
					}
					const rtcPath = ['DEVICE', 'device', 'system', 'rtc', 'cmd', 'pp']
					const day = this.state.get([...rtcPath, 'day'])
					const month = monthAbbrev[this.state.get([...rtcPath, 'month'])] ?? '???'
					const hours = this.state.get([...rtcPath, 'hours'])
					const minutes = this.state.get([...rtcPath, 'minutes'])
					this.connection.sendWSmessage([...bankItemPath, 'label'], `Saved from ${screen} - ${month} ${day}, ${pad(hours)}:${pad(minutes)}`)
				}
				this.instance.sendXupdate()
				await this.waitForStateValue(bankValidPath, (v) => v === true)
			})
		}

		return deviceSaveScreenMemory
	}

	/**
	 * MARK: Reset Layer Size or Ratio
	 */
	get deviceResetLayerSize() {
		const deviceResetLayerSize = super.deviceResetLayerSize

		this.dropGlobalAnchorChoice(deviceResetLayerSize.options)

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
					ret = (this.state.get('REMOTE/live/screens/layerSelection/layerIds') ?? [])
						.map((key: Key) => {
							return {
								screenAuxKey: key.screenAuxKey.replace(/(?<!^)\D/g, ''), 
								layerKey: key.layerKey.replace(/LIVE_/, '').replace(/BKG/, 'NATIVE')
							}
						})
				} else {
					// `?? []` because LOCAL/layerIds does not exist until a layer has been selected at least
					// once - and the very next thing done with `ret` is findIndex/push, so without it the first
					// selection made on a fresh connection throws before it can store anything.
					ret = this.state.get('LOCAL/layerIds') ?? []
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
					ret = (this.state.get('REMOTE/live/screens/layerSelection/layerIds') ?? [])
						.map((key: Key) => {
							return {
								screenAuxKey: key.screenAuxKey.replace(/(?<!^)\D/g, ''),
								layerKey: key.layerKey.replace(/LIVE_/, '').replace(/BKG/, 'NATIVE')
							}
						})
				} else {
					// `?? []` because LOCAL/layerIds does not exist until a layer has been selected at least
					// once - and the very next thing done with `ret` is findIndex/push, so without it the first
					// selection made on a fresh connection throws before it can store anything.
					ret = this.state.get('LOCAL/layerIds') ?? []
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
			name: 'LIVE - Stream Control (Midra/Alta)',
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
			name: 'Audio - Mute Stream (Midra/Alta)',
			sortName: '05 Audio - Mute Stream',
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
			sortName: '05 Audio - Route (Block)',
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
			sortName: '05 Audio - Route (Channels)',
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
					{ id: 'HORIZONTAL_GRADIENT', label: 'Horizontal Gradient' },
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
					{ id: 'HORIZONTAL_GRADIENT', label: 'Horizontal Gradient' },
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
			sortName: '07 Device - Power',
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
			name: 'Preconfig - Assign Image from Library to Foreground/Background Frame (Midra/Alta)',
			sortName: '06 Preconfig - Assign Image from Library to Foreground/Background Frame',
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
