import {AWJinstance} from '../index.js'

import Choices, { Choicemeta, AnchorPoint } from './choices.js'
import {
	CompanionActionContext,
	CompanionActionDefinitions,
	CompanionActionEvent,
	CompanionInputFieldDropdown,
	DropdownChoice,
	SomeCompanionActionInputField,
} from '@companion-module/base'
import { Config } from '../config.js'
import { compileExpression } from '@nx-js/compiler-util'
import { AWJconnection } from '../connection.js'
import { splitRgb } from '@companion-module/base'
import { StateMachine } from '../state.js'
import Constants from './constants.js'
import { timeToSeconds, parseBoolean } from '../util.js'

/**
 * T = Object like {option1id: type, option2id: type}
 */
type AWJaction<T> = {
	name: string
	description?: string
	// Note: Companion's real action schema has no top-level "tooltip" field, only "description" - only options
	// have their own "tooltip". Do not add tooltip back here; it silently gets dropped (see the cstawjcmd/
	// cstawjgetcmd fix that replaced their mistaken action-level "tooltip" with "description").
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

// const XUPDATE = '{"channel":"DEVICE","data":{"path":"device/screenGroupList/control/pp/xUpdate","value":true}}'
// const XUPDATEmidra = '{"channel":"DEVICE","data":{"path":"device/preset/control/pp/xUpdate","value":true}}'

export default class Actions {
	instance: AWJinstance
	state!: StateMachine
	connection!: AWJconnection
	config!: Config
	choices!: Choices
	constants!: typeof Constants
	screens!: Choicemeta[]

	readonly actionsToUse = [
		'deviceScreenMemory',
		'deviceUpdatePreset',
		'deviceSaveScreenMemory',
		'deviceAuxMemory',
		'deviceMasterMemory',
		'deviceMultiviewerMemory',
		'deviceLayerMemory',
		'deviceTakeScreen',
		'deviceCutScreen',
		'deviceTbar',
		'deviceTakeTime',
		'deviceScreenEncoderAdjustV3',
		'deviceInputKeying',
		'deviceInputFreeze',
		'deviceLayerFreeze',
		'deviceScreenFreeze',
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
		'remoteSync',
		'deviceStreamControl',
		'deviceStreamAudioMute',
		'deviceAudioRouteBlock',
		'deviceAudioRouteChannels',
		'deviceTimerSetup',
		'deviceTimerAdjust',
		'deviceTimerTransport',
		'deviceTestpatterns',
		'cstawjcmd',
		'cstawjgetcmd',
		'devicePower',
		'deviceBackupSetSource',
		'deviceBackupAutoMode',
	]
	
	constructor (instance: AWJinstance) {
		this.instance = instance
		this.init()
	}

	protected init() {
		this.state = this.instance.state
		this.connection = this.instance.connection
		this.config = this.instance.config
		this.choices = this.instance.choices
		this.constants = this.instance.constants
		this.screens = this.choices.getScreensAuxArray()
	}

	/**
	 * Object with all exported action definitions
	 */
	get allActions() {
		const actionDefinitions: CompanionActionDefinitions = Object.fromEntries(
            this.actionsToUse.map((key) => [key, this[key]])
        )
        
        return actionDefinitions
	}

	/**
	 *  MARK: Recall Screen Memory Common
	 */
	get deviceScreenMemory()  {
		const returnAction: AWJaction<{ screens: string, preset: string, memory: string, selectScreens: boolean, unlockIfLocked: boolean, relockAfterChange: boolean}> = {
			name: 'LIVE - Recall Screen Memory',
			sortName: '01 LIVE - 02 Recall Screen Memory',
			description: 'Recalls a Screen Memory, loading its saved Layer configuration into the chosen Screen(s)\' Program or Preview preset. Waits for the device to confirm the recall before returning - only actually delays a following action when both are inside a Sequential Action Group (a plain action list runs everything at once regardless).',
			options: [
				{
					id: 'screens',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screen',
					choices: [{ id: 'first', label: 'First/Only Selected Screen' }, { id: 'sel', label: 'Selected' }],
					default: 'sel',
				},
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset (Program/Preview)',
					choices: [{ id: 'sel', label: 'Selected' }, ...this.choices.choicesPreset],
				allowInvalidValues: true,
					default: 'prw',
				},
				{
					id: 'memory',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screen Memory',
					choices: this.choices.getScreenMemoryChoices(),
					default: this.choices.getScreenMemoryChoices()[0]?.id ?? '',
				},
				{
					id: 'selectScreens',
					type: 'checkbox',
					label: 'Select screens after load',
					tooltip: 'Selects the affected screens after loading the memory and deselects any other selected screens.',
					default: true,
				},
				{ id: 'additionalOptionsHeader', type: 'static-text', label: '', value: '---\n**Additional Options**', disableAutoExpression: true },
				{
					id: 'unlockIfLocked',
					type: 'checkbox',
					label: 'Unlock Screen if locked?',
					tooltip: 'Unlocks all affected screens before execution if they are locked.',
					default: false,
				},
				{
					id: 'relockAfterChange',
					type: 'checkbox',
					label: 'Relock after change',
					tooltip: 'Locks all affected screens after execution if they were previously locked.',
					default: false,
					isVisibleExpression: '$(options:unlockIfLocked) == true',
				},
			],
			callback: () => {
			},
		}

		return returnAction
	}

	/**
	 * MARK: Save/Revert Screen Memory Changes
	 */
	get deviceUpdatePreset() {
		const returnAction: AWJaction<{ screens: string, preset: string, mode: string, unlockIfLocked: boolean, relockAfterChange: boolean }> = {
			name: 'LIVE - Save/Revert Screen Memory Changes',
			sortName: '01 LIVE - 17 Save/Revert Screen Memory Changes',
			description: 'Mirrors the Save/Revert function in the top-right corner of the WebRCS editor, where you click the SM number to either save your current changes or restore the Screen Memory to its previously saved state. Does nothing on a Screen/Preset where no Screen Memory is currently loaded. Waits for the device to confirm before returning - only actually delays a following action when both are inside a Sequential Action Group (a plain action list runs everything at once regardless).',
			options: [
				{
					id: 'screens',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screen / Aux',
					choices: [{ id: 'first', label: 'First/Only Selected Screen' }, { id: 'sel', label: 'All Selected Screens' }],
					default: 'first',
				},
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset (Program/Preview)',
					choices: [{ id: 'sel', label: 'Selected' }, ...this.choices.choicesPreset],
					allowInvalidValues: true,
					default: 'prw',
				},
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Save or Revert',
					choices: [
						{ id: 'save', label: 'Save Changes' },
						{ id: 'revert', label: 'Revert Changes' },
					],
					default: 'save',
					disableAutoExpression: true,
				},
				{ id: 'additionalOptionsHeader', type: 'static-text', label: '', value: '---\n**Additional Options**', disableAutoExpression: true },
				{
					id: 'unlockIfLocked',
					type: 'checkbox',
					label: 'Unlock Screen if locked?',
					tooltip: 'Unlocks all affected screens before execution if they are locked.',
					default: false,
				},
				{
					id: 'relockAfterChange',
					type: 'checkbox',
					label: 'Relock after change',
					tooltip: 'Locks all affected screens after execution if they were previously locked.',
					default: false,
					isVisibleExpression: '$(options:unlockIfLocked) == true',
				},
			],
			callback: () => {
			},
		}

		return returnAction
	}

	/**
	 * MARK: Save Screen Memory to Slot
	 */
	get deviceSaveScreenMemory() {
		const returnAction: AWJaction<{ screens: string, preset: string, memory: string, label: string, action: string, allowExisting: boolean }> = {
			name: 'LIVE - Save Screen Memory to Slot (+ edit label/delete Screen Memory)',
			sortName: '01 LIVE - 18 Save Screen Memory to Slot',
			description: 'Saves the current live Layer configuration of a Screen/Aux\'s Program or Preview preset into a chosen Screen Memory slot (either an explicitly picked one, overwriting whatever is saved there, or the next currently-empty slot) - or, instead, just renames or deletes an existing Screen Memory slot without touching any live Screen. Unlike "Save/Revert Screen Memory Changes", saving here does not require the slot to already be loaded - it can save into any slot, used or empty. Waits for the device to confirm before returning - only actually delays a following action (e.g. another "Save to Slot" targeting "Next Available") when both are inside a Sequential Action Group (a plain action list runs everything at once regardless).',
			options: [
				{
					id: 'screens',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screen / Aux',
					choices: [{ id: 'first', label: 'First/Only Selected Screen' }],
					default: 'first',
					tooltip: 'Only used by "Save Screen Memory" below. A Screen Memory always saves exactly one Screen/Aux\'s state - there is no multi-selection here, unlike Recall. Even when using an expression that resolves to several screens (e.g. concatenated "S1S2"), only the first one is used.',
				},
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset (Program/Preview)',
					tooltip: 'Only used by "Save Screen Memory" below.',
					choices: [{ id: 'sel', label: 'Selected' }, ...this.choices.choicesPreset],
					allowInvalidValues: true,
					default: 'prw',
				},
				{ id: 'memorySectionHeader', type: 'static-text', label: '', value: '---\n**Screen Memory**', disableAutoExpression: true },
				{
					id: 'memory',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screen Memory',
					choices: [{ id: 'next', label: 'Next Available (first empty slot)' }, ...this.choices.getAllScreenMemorySlotChoices()],
					default: 'next',
				},
				{
					id: 'label',
					type: 'textinput',
					label: 'Memory Label',
					tooltip: 'Maximum 32 characters (WebRCS\'s own limit). "Update Screen Memory Label" always sets this (leave empty to clear it). "Save Screen Memory" applies whatever you type here too, whether saving into an empty slot or overwriting an existing one - only leaving it EMPTY behaves differently depending on the target: saving into a still-empty slot then auto-generates "Saved from <Screen> - <Mon> <day>, <hh>:<mm>" (device\'s own clock), while overwriting an existing Screen Memory with an empty field keeps that memory\'s current label untouched instead. Ignored by "Delete Screen Memory".',
					default: '',
					regex: '^.{0,32}$',
					useVariables: true,
				},
				{
					id: 'action',
					type: 'dropdown',
					label: 'Action',
					choices: [
						{ id: 'save', label: 'Save Screen Memory' },
						{ id: 'updateLabel', label: 'Update Screen Memory Label' },
						{ id: 'delete', label: 'Delete Screen Memory' },
					],
					default: 'save',
					disableAutoExpression: true,
				},
				{
					id: 'allowExisting',
					type: 'checkbox',
					label: 'Allow save, update or delete of existing Screen Memory?',
					tooltip: 'Safety guard: while unchecked, the action refuses to touch a Screen Memory slot that already holds valid content (whether saving over it, relabeling it, or deleting it) - it only ever acts on a still-empty slot. Enable this deliberately when you actually want to overwrite, rename, or remove an existing Screen Memory.',
					default: false,
				},
			],
			callback: () => {
			},
		}

		return returnAction
	}

	/**
	 * MARK: Recall Layer Memory
	 */
	get deviceLayerMemory() {
		type DeviceLayerMemory = { method: string, screen: string[], preset: string, layer: string[], memory: string, unlockIfLocked: boolean, relockAfterChange: boolean }

		const returnAction: AWJaction<DeviceLayerMemory> = {
			name: 'LIVE - Recall Layer Memory',
			sortName: '01 LIVE - 03 Recall Layer Memory',
			description: 'Recalls a Layer Memory into one or more specific Layers, loading only that Layer\'s saved source/position/properties without affecting the rest of the Screen or Preset. Waits for the device to confirm before returning - only actually delays a following action when both are inside a Sequential Action Group (a plain action list runs everything at once regardless).',
			options: [
				{
					id: 'method',
					type: 'dropdown',
					label: 'Method',
					choices: [
						{ id: 'spec', label: 'Use Specified Layers' },
						{ id: 'sel', label: 'Use Selected Layers' },
					],
					default: 'spec',
					disableAutoExpression: true,
				},
				{
					id: 'screen',
					allowInvalidValues: true,
					type: 'multidropdown',
					label: 'Screen / Aux',
					choices: this.choices.getScreenAuxChoices(),
					default: [this.choices.getScreenAuxChoices()[0]?.id],
					isVisibleExpression: "$(options:method) == 'spec'",
				},
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset (Program/Preview)',
					choices: [{ id: 'sel', label: 'Selected' }, ...this.choices.choicesPreset],
				allowInvalidValues: true,
					default: 'prw',
					isVisibleExpression: "$(options:method) == 'spec'",
				},
				{
					id: 'layer',
					type: 'multidropdown',
					label: 'Layer',
					choices: this.choices.getLayerChoices(this.choices.getMaxConfiguredLayerCount(), true),
					default: ['1'],
					isVisibleExpression: "$(options:method) == 'spec'",
				},
				{
					id: 'memory',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Layer Memory',
					choices: this.choices.getLayerMemoryChoices(),
					default: this.choices.getLayerMemoryChoices()[0]?.id,
				},
				{ id: 'additionalOptionsHeader', type: 'static-text', label: '', value: '---\n**Additional Options**', disableAutoExpression: true },
				{
					id: 'unlockIfLocked',
					type: 'checkbox',
					label: 'Unlock Screen if locked?',
					tooltip: 'Unlocks all affected screens before execution if they are locked.',
					default: false,
				},
				{
					id: 'relockAfterChange',
					type: 'checkbox',
					label: 'Relock after change',
					tooltip: 'Locks all affected screens after execution if they were previously locked.',
					default: false,
					isVisibleExpression: '$(options:unlockIfLocked) == true',
				},
			],
			callback: (action) => {
				let layers: { screenAuxKey: string; layerKey: string }[] = []
				let preset: string
				if (action.options.method === 'sel') {
					layers = this.choices.getSelectedLayers() ?? []
					preset = this.choices.getPresetSelection('sel', true)
				} else {
					for (const screen of action.options.screen) {
						for (const layer of action.options.layer) {
							layers.push({ screenAuxKey: screen, layerKey: layer })
						}
					}
					preset = this.choices.getPresetSelection(action.options.preset, true)
				}
				// serialize() keyed by the actual target screens - see its own doc comment for why this must
				// never be a single fixed key: an unrelated screen's action must never wait on this one.
				return this.instance.serialize(layers.map((layer) => layer.screenAuxKey), async () => {
				const unlockedScreens = new Set<string>()
				layers = layers.filter((layer) => {
					if (this.choices.isLocked(layer.screenAuxKey, preset)) {
						if (!parseBoolean(action.options.unlockIfLocked)) return false
						if (!unlockedScreens.has(layer.screenAuxKey)) {
							this.choices.setScreenLock(layer.screenAuxKey, preset, false)
							unlockedScreens.add(layer.screenAuxKey)
						}
					}
					return true
				})
				const waitPromises: Promise<void>[] = []
				for (const layer of layers) {
					const listKey = layer.screenAuxKey.charAt(0) === 'A' ? this.constants.auxPath[1] : this.constants.screenPath[1]
					const layerPath = [
						'device',
						'layerBank',
						'control',
						'load',
						'slotList',
						'items',
						action.options.memory,
						listKey,
						'items',
						layer.screenAuxKey,
						'presetList',
						'items',
						preset,
						'layerList',
						'items',
						layer.layerKey,
						'pp',
					]
					this.connection.sendWSmessage([...layerPath, 'xRequest'], false, true)
					waitPromises.push(this.waitForPulseComplete(['DEVICE', ...layerPath, 'isLoading']))
				}
				if (parseBoolean(action.options.relockAfterChange)) {
					for (const screenAuxKey of unlockedScreens) {
						this.choices.setScreenLock(screenAuxKey, preset, true)
					}
				}
				this.instance.sendXupdate()
				await Promise.all(waitPromises)
				})
			},
		}

		return returnAction
	}

	// MARK: recall Aux memory
	get deviceAuxMemory() {
		
		const deviceAuxMemory: AWJaction<{ screens: string, preset: string, memory: string, selectScreens: boolean}> = {
			name: 'LIVE - Recall Aux Memory',
			sortName: '01 LIVE - 14 Recall Aux Memory',
			description: 'Recalls an Aux Memory, loading its saved Layer configuration into the chosen Auxscreen(s)\' Program or Preview preset. Waits for the device to confirm before returning - only actually delays a following action when both are inside a Sequential Action Group (a plain action list runs everything at once regardless).',
			options: [
				{
					id: 'screens',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Auxscreen',
					choices: [{ id: 'first', label: 'First/Only Selected Auxscreen' }, { id: 'sel', label: 'Selected' }, ...this.choices.getAuxChoices()],
					default: 'sel',
				},
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset (Program/Preview)',
					choices: [{ id: 'sel', label: 'Selected' }, ...this.choices.choicesPreset],
				allowInvalidValues: true,
					default: 'prw',
				},
				{
					id: 'memory',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Aux Memory',
					choices: this.choices.getAuxMemoryChoices(),
					default: this.choices.getAuxMemoryChoices()[0]?.id ?? '',
				},
				{
					id: 'selectScreens',
					type: 'checkbox',
					label: 'Select screens after load',
					tooltip: 'Selects the affected screens after loading the memory and deselects any other selected screens.',
					default: true,
				},
			],
			callback: () => {},
		}
	return deviceAuxMemory
	}

	/**
	 * MARK: Recall Master Memory
	 */
	//type DeviceMasterMemory = {preset: string, memory: string, selectScreens: boolean}
	get deviceMasterMemory() {
		
		const deviceMasterMemory: AWJaction<{preset: string, memory: string, selectScreens: boolean, unlockIfLocked: boolean, relockAfterChange: boolean}> = {
			name: 'LIVE - Recall Master Memory',
			sortName: '01 LIVE - 01 Recall Master Memory',
			description: 'Recalls a Master Memory, loading its saved preset simultaneously across every Screen/Auxscreen it was saved with. Waits for the device to confirm before returning - only actually delays a following action when both are inside a Sequential Action Group (a plain action list runs everything at once regardless).',
			options: [
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset (Program/Preview)',
					choices: [{ id: 'sel', label: 'Selected' }, ...this.choices.choicesPreset],
				allowInvalidValues: true,
					default: 'prw',
				},
				{
					id: 'memory',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Master Memory',
					choices: this.choices.getMasterMemoryChoices(),
					default: this.choices.getMasterMemoryChoices()[0]?.id,
				},
				{
					id: 'selectScreens',
					type: 'checkbox',
					label: 'Select screens after load',
					tooltip: 'Selects the affected screens after loading the memory and deselects any other selected screens.',
					default: true,
				},
				{ id: 'additionalOptionsHeader', type: 'static-text', label: '', value: '---\n**Additional Options**', disableAutoExpression: true },
				{
					id: 'unlockIfLocked',
					type: 'checkbox',
					label: 'Unlock Screen if locked?',
					tooltip: 'Unlocks all affected screens before execution if they are locked.',
					default: false,
				},
				{
					id: 'relockAfterChange',
					type: 'checkbox',
					label: 'Relock after change',
					tooltip: 'Locks all affected screens after execution if they were previously locked.',
					default: false,
					isVisibleExpression: '$(options:unlockIfLocked) == true',
				},
			],

		}

		return deviceMasterMemory
	}

	/**
	 * MARK: Recall Multiviewer Memory
	 */
	get deviceMultiviewerMemory() {
		
		const deviceMultiviewerMemory: AWJaction<{memory: string, multiviewer: string[]}> = {
			name: 'Multiviewer - Recall Memory',
			sortName: '03 Multiviewer - Recall Memory',
			description: 'Recalls a Multiviewer Memory, loading its saved widget layout onto the chosen Multiviewer(s).',
			options: [
				{
					id: 'memory',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Memory',
					choices: this.choices.getMultiviewerMemoryChoices(),
					default: this.choices.getMultiviewerMemoryChoices()[0]?.id,
				},
			],
			callback: (action) => {
				for (const mv of action.options.multiviewer) {
					const fullpath = [
						'device',
						'monitoringBank',
						'control',
						'load',
						'slotList',
						'items',
						action.options.memory,
						'outputList',
						'items',
						mv,
						'pp',
						'xRequest',
					]
					this.connection.sendWSmessage( fullpath, false, true )

				}
			},
		}
		if (this.choices.getMultiviewerArray().length > 1) {
			deviceMultiviewerMemory.options.push(
				{
					id: 'multiviewer',
					type: 'multidropdown',
					label: 'Multiviewer',
					choices: this.choices.getMultiviewerChoices(),
					default: [this.choices.getMultiviewerArray()?.[0]],
				},
			)
		} else {
			deviceMultiviewerMemory.options.push(
				{
					id: 'multiviewer',
					type: 'multidropdown',
					label: 'Multiviewer',
					choices: [{id: '1', label: 'Multiviewer 1'}],
					default: ['1'],
					isVisibleExpression: 'false',
				},
			)
		}

		return deviceMultiviewerMemory
	}

	/**
	 * MARK: Take one or multiple screens
	 */
	get deviceTakeScreen() {
		type DeviceTakeScreen = {screens: string, waitForComplete: boolean}
		const deviceTakeScreen: AWJaction<DeviceTakeScreen> = {
			name: 'LIVE - Transition TAKE',
			sortName: '01 LIVE - 04 Take',
			description: 'Transitions the selected Screen(s)/Auxscreen(s) from Preview to Program, using the configured Transition Time. Waiting (whether for the near-instant receipt confirmation, or the full transition via "Wait for Transition Completion" below) only actually delays a following action when both are inside a Sequential Action Group - a plain action list runs everything at once regardless.',
			options: [
				{
					id: 'screens',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screens / Auxscreens',
					tooltip: 'To target multiple screens other than "All Screens" or "All Selected Screens", switch to Expression Mode and use a format like S1S2A1.',
					choices: [
						{ id: 'first', label: 'First/Only Selected Screen' },
						{ id: 'all', label: 'All Screens' },
						{ id: 'sel', label: 'Selected Screens' },
						...this.choices.getScreenAuxChoices()
					],
					default: 'sel',
				},
				{ id: 'additionalOptionsHeader', type: 'static-text', label: '', value: '---\n**Additional Options**', disableAutoExpression: true },
				{
					id: 'waitForComplete',
					type: 'checkbox',
					label: 'Wait for Transition Completion',
					tooltip: 'Off (default): the button only waits until the Take command has been received by the device (near-instant) before running the next action in this sequence. On: waits for the actual fade to finish - useful if a later action in the same sequence needs the Screen(s) to have fully landed on Program first. Only takes effect inside a Sequential Action Group (a plain action list runs everything at once, regardless of this setting) - and can only ever cover Transition Times up to about 4.5 seconds, since Companion itself will not let a single action run any longer than that. For a longer Transition Time, use an explicit Wait action of the right duration instead.',
					default: false,
				},
			],
			callback: () => {}, // override
		}
		return deviceTakeScreen
	}

	/**
	 * MARK: Cut one or multiple screens
	 */
	get deviceCutScreen() {
		type DeviceCutScreen = {screens: string}

		const deviceCutScreen: AWJaction<DeviceCutScreen> = {
			name: 'LIVE - Transition CUT',
			sortName: '01 LIVE - 05 Cut',
			description: 'Instantly cuts the selected Screen(s)/Auxscreen(s) from Preview to Program, without a transition.',
			options: [
				{
					id: 'screens',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screens / Auxscreens',
					tooltip: 'To target multiple screens other than "All Screens" or "All Selected Screens", switch to Expression Mode and use a format like S1S2A1.',
					choices: [{ id: 'first', label: 'First/Only Selected Screen' }, { id: 'all', label: 'All Screens' }, { id: 'sel', label: 'Selected Screens' }, ...this.choices.getScreenAuxChoices()],
					default: 'sel',
				},
			],
			callback: (action) => {
				const targetScreens = action.options.screens === 'first'
					? this.choices.getSelectedScreens().slice(0, 1)
					: this.choices.getChosenScreenAuxes(action.options.screens)
				// serialize() keyed by the actual target screens - see its own doc comment for why this must
				// never be a single fixed key: an unrelated screen's action must never wait on this one. Cut
				// itself is near-instant, so unlike Take there's no need to release the lock before waiting.
				return this.instance.serialize(targetScreens, async () => {
				for (const screen of targetScreens) {
					this.connection.sendWSmessage(
						[
							...(screen.startsWith('A') ? this.constants.auxGroupPath : this.constants.screenGroupPath),
							'items',
							screen,
							'control',
							'pp',
							'xCut'
						],
						true
					)
				}
				// Confirms receipt only, not full completion - see waitForPulseComplete()'s doc comment for why
				// a fixed delay (not a status poll) is used specifically for Take/Cut.
				await this.delay(200)
				})
			},
		}

		return deviceCutScreen
	}

	/**
	 * MARK: Set T-Bar Position
	 */
	get deviceTbar() {
		type DeviceTbar = {screens: string, position: string, maximum: string}
		
		const deviceTbar: AWJaction<DeviceTbar> = {
			name: 'LIVE - Set T-Bar Position',
			sortName: '01 LIVE - 12 Set T-Bar Position',
			description: 'Manually sets the T-Bar position for the selected Screen(s)/Auxscreen(s), blending between Program and Preview. WebRCS always applies T-Bar position to all screens at once - it is never synchronized per-screen.',
			options: [
				{
					id: 'info',
					type: 'static-text',
					label: 'Beware: in WebRCS you always set the T-Bar Position for ALL screens. T-Bar position is never syncronized.',
					value: ''
				},
				{
					id: 'screens',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screens / Auxscreens',
					choices: [{ id: 'first', label: 'First/Only Selected Screen' }, { id: 'all', label: 'All Screens' }, { id: 'sel', label: 'Selected Screens' }, ...this.choices.getScreenAuxChoices()],
					default: 'all',
				},
				{
					id: 'position',
					type: 'textinput',
					label: 'Position',
					default: '0',
					regex: '^\\d+(\\.\\d+)?$|^\\$\\(\\w+:\\w+\\)$',
					useVariables: true,
					tooltip: 'Enter position as a numeric string. Can be floating point or integer number. Variables can be used. 100% is in relation to maximum value.'
				},
				{
					id: 'maximum',
					type: 'textinput',
					label: 'Maximum value',
					default: '100',
					regex: '^\\d+(\\.\\d+)?$|^\\$\\(\\w+:\\w+\\)$',
					useVariables: true,
					tooltip: 'Enter maximum as a numeric string. Can be floating point or integer number. Variables can be used.'
				}
			],
			callback: async (action) => {
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
						this.connection.sendWSmessage([...this.constants.screenGroupPath, 'items', screen, 'control', 'pp', 'tbarPosition'], tbarint)
					}
					this.instance.sendXupdate()
				}
			},
		}

		return deviceTbar
	}

	/**
	 * MARK: Change the transition time of a preset per screen
	 */
	get deviceTakeTime() {
		type DeviceTakeTime = {screens: string, preset: string, time: number}

		const deviceTakeTime: AWJaction<DeviceTakeTime> = {
			name: 'LIVE - Set Transition Time',
			sortName: '01 LIVE - 08 Set Transition Time',
			description: 'Sets the transition (fade) time used by Take, separately for the Program-bound and Preview-bound direction of the selected Screen(s)/Auxscreen(s). Waits for the device to confirm before returning - only actually delays a following action (e.g. Take, using the new time right away) when both are inside a Sequential Action Group (a plain action list runs everything at once regardless).',
			options: [
				{
					id: 'screens',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screens / Auxscreens',
					choices: [{ id: 'first', label: 'First/Only Selected Screen' }, { id: 'all', label: 'All Screens' }, { id: 'sel', label: 'Selected Screens' }, ...this.choices.getScreenAuxChoices()],
					default: 'all',
				},
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset (Program/Preview)',
					choices: [{ id: 'all', label: 'Both (Program/Preview)' }, ...this.choices.choicesPreset],
				allowInvalidValues: true,
					default: 'all',
				},
				{
					id: 'time',
					type: 'number',
					label: 'Time (seconds)',
					min: 0,
					max: 300,
					step: 0.1,
					default: 1,
					range: true,
				},
			],
			callback: (action) => {
				const targetScreens = action.options.screens === 'first'
					? this.choices.getSelectedScreens().slice(0, 1)
					: this.choices.getChosenScreenAuxes(action.options.screens)
				// serialize() keyed by the actual target screens - see its own doc comment for why this must
				// never be a single fixed key: an unrelated screen's action must never wait on this one.
				return this.instance.serialize(targetScreens, async () => {
				// round to whole deciseconds - the device protocol only understands integer deciseconds, and
				// values coming from expressions (e.g. "$(AWJdevice:S1.pgm.time) + 0.1") can carry JS floating-point
				// residue (2.7 + 0.1 = 2.8000000000000003) that must not reach the device as-is
				const time = Math.round(action.options.time as number * 10)
				// 'prw' (current) and 'pvw' (kept for backward compatibility, see choicesPreset) mean the same thing
				const preset = ['prw', 'prv'].includes(action.options.preset?.toLowerCase()) ? 'pvw' : action.options.preset
				const waitPromises: Promise<boolean>[] = []
				targetScreens.forEach((screen) => {
					const presetPgm = this.choices.getPreset(screen, 'PGM')
					// direction must match deviceTakeScreen's mapping: presetPgm === 'A' means the next take moves the T-Bar up (xTakeUp),
					// so "pgm" (the direction leading into the new program) corresponds to takeUpTime there, not takeDownTime
					if (
						preset === 'all' ||
						(preset === 'pgm' && presetPgm === 'B') ||
						(preset === 'pvw' && presetPgm === 'A')
					) {
						const path = [...this.constants.screenGroupPath, 'items', screen, 'control', 'pp', 'takeDownTime']
						this.connection.sendWSmessage(path, time)
						waitPromises.push(this.waitForStateValue(['DEVICE', ...path], (v) => v === time))
					}
					if (
						preset === 'all' ||
						(preset === 'pvw' && presetPgm === 'B') ||
						(preset === 'pgm' && presetPgm === 'A')
					) {
						const path = [...this.constants.screenGroupPath, 'items', screen, 'control', 'pp', 'takeUpTime']
						this.connection.sendWSmessage(path, time)
						waitPromises.push(this.waitForStateValue(['DEVICE', ...path], (v) => v === time))
					}
				})
				this.instance.sendXupdate()
				await Promise.all(waitPromises)
				})
			},
		}

		return deviceTakeTime
	}

	/**
	 * MARK: Screen - Encoder Adjust
	 */
	get deviceScreenEncoderAdjustV3() {
		// Screen-scoped counterpart to "Layer Properties - Encoder Adjust" - same Raw/Percent priority idea
		// (highest priority first-filled-in wins), but for the two continuous screen-level values that make
		// sense for a rotary encoder: T-Bar Position and Transition Time. Kept as its own action (not merged
		// into the layer one) since its targeting is Screens/Auxscreens (matching the existing "Set T-Bar
		// Position"/"Set Transition Time" actions), not Screen/Preset/Layer - mixing both targeting schemes
		// behind one dropdown risked Companion's isVisibleExpression reliability issues seen elsewhere in this
		// module with cross-dependent field visibility.
		// T-Bar's Raw and Percent fields are deliberately the same 0-100 scale as "Set T-Bar Position"'s own
		// Position field at its default Maximum of 100 (and the SelectedScreen.tbarPosition variable) - not the
		// device's literal 0-65535 - so a value read from that variable can be fed straight back in without any
		// conversion math. Transition Time's Percent is of a fixed 0-300s (0-3000 decisecond) reference range,
		// matching "Set Transition Time"'s own slider bounds.
		type DeviceScreenEncoderAdjustV3 = {
			screens: string, value: string, preset: string, direction: string,
			stepRaw: string, stepPercent: string,
		}

		const deviceScreenEncoderAdjustV3: AWJaction<DeviceScreenEncoderAdjustV3> = {
			name: 'LIVE - Encoder Adjust',
			sortName: '01 LIVE - 09 Encoder Adjust',
			description: 'Increments/decrements T-Bar Position or Transition Time by a step amount - built for rotary encoders. Raw/Percent are tried in that order (first one filled in wins) - Percent defaults to 1 (a sensible fine step) if left untouched.',
			options: [
				{
					id: 'screens',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screens / Auxscreens',
					choices: [{ id: 'first', label: 'First/Only Selected Screen' }, { id: 'all', label: 'All Screens' }, { id: 'sel', label: 'Selected Screens' }, ...this.choices.getScreenAuxChoices()],
					default: 'all',
				},
				{ id: 'targetHeader', type: 'static-text', label: '', value: '---', disableAutoExpression: true },
				{
					id: 'value',
					type: 'dropdown',
					label: 'Value',
					choices: [{ id: 'tbar', label: 'T-Bar Position' }, { id: 'transitionTime', label: 'Transition Time' }],
					default: 'tbar',
				},
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset (Program/Preview)',
					tooltip: 'Only applies to Transition Time. "Both" adjusts the times for both directions by the same step.',
					choices: [{ id: 'all', label: 'Both (Program/Preview)' }, ...this.choices.choicesPreset],
				allowInvalidValues: true,
					default: 'all',
					isVisibleExpression: "$(options:value) == 'transitionTime'",
				},
				{
					id: 'direction',
					type: 'dropdown',
					label: 'Direction',
					choices: [{ id: 'increment', label: 'Increment (+)' }, { id: 'decrement', label: 'Decrement (-)' }],
					default: 'increment',
				},
				{
					id: 'stepRaw',
					type: 'textinput',
					label: 'Raw Value',
					tooltip: 'Leave empty to not use this field. Highest priority - if filled, Percent below is ignored. T-Bar Position: 0-100, same scale as "Set T-Bar Position"\'s Position field at Maximum 100. Transition Time: deciseconds (10 = 1 second), the device\'s own raw unit.',
					default: '',
					useVariables: true,
				},
				{
					id: 'stepPercent',
					type: 'textinput',
					label: 'Percent',
					tooltip: 'Used only if Raw Value above is empty. T-Bar Position: percent of the full 0-100 range (identical in effect to Raw Value for this value). Transition Time: percent of a fixed 0-300 second reference range, matching "Set Transition Time"\'s own slider bounds. Defaults to 1 - a sensible fine-adjustment step if you don\'t fill in any of the three fields at all.',
					default: '1',
					useVariables: true,
				},
			],
			callback: (action) => {
				const direction = action.options.direction === 'decrement' ? -1 : 1
				const rawStr = action.options.stepRaw
				const pctStr = action.options.stepPercent
				const hasRaw = rawStr !== '' && !isNaN(Number(rawStr))
				const hasPct = pctStr !== '' && !isNaN(Number(pctStr))
				if (!hasRaw && !hasPct) return // nothing to apply

				const targetScreens = action.options.screens === 'first'
					? this.choices.getSelectedScreens().slice(0, 1)
					: this.choices.getChosenScreenAuxes(action.options.screens)
				for (const screen of targetScreens) {
					if (action.options.value === 'tbar') {
						const delta0to100 = hasRaw ? Number(rawStr) : Number(pctStr)
						const groupPath = [...this.constants.screenGroupPath, 'items', screen, 'control', 'pp']
						const current = this.state.get(['DEVICE', ...groupPath, 'tbarPosition']) ?? 0
						const newValue = Math.round(Math.min(65535, Math.max(0, current + direction * delta0to100 / 100 * 65535)))
						this.connection.sendWSmessage([...groupPath, 'tbarPosition'], newValue)
					} else {
						const deltaDeciseconds = hasRaw ? Number(rawStr) : Number(pctStr) / 100 * 3000
						const groupPath = [...this.constants.screenGroupPath, 'items', screen, 'control', 'pp']
						const presetPgm = this.choices.getPreset(screen, 'PGM')
						const adjust = (prop: 'takeUpTime' | 'takeDownTime') => {
							const current = this.state.get(['DEVICE', ...groupPath, prop]) ?? 0
							const newValue = Math.round(Math.min(3000, Math.max(0, current + direction * deltaDeciseconds)))
							this.connection.sendWSmessage([...groupPath, prop], newValue)
						}
						// same direction mapping as deviceTakeTime: when the screen's current PGM side is preset
						// A, takeUpTime is "pgm" and takeDownTime is "pvw" - and vice versa when PGM is B
						// 'prw' (current) and 'pvw' (kept for backward compatibility, see choicesPreset) mean the same thing
						const preset = ['prw', 'prv'].includes(action.options.preset?.toLowerCase()) ? 'pvw' : action.options.preset
						if (preset === 'all' || (preset === 'pgm' && presetPgm === 'B') || (preset === 'pvw' && presetPgm === 'A')) {
							adjust('takeDownTime')
						}
						if (preset === 'all' || (preset === 'pvw' && presetPgm === 'B') || (preset === 'pgm' && presetPgm === 'A')) {
							adjust('takeUpTime')
						}
					}
				}
				this.instance.sendXupdate()
			},
		}

		return deviceScreenEncoderAdjustV3
	}

	// MARK: Select the source in a layer
	get deviceSelectSource() {
		type DeviceSelectSource = {method: string, screen: string[], preset: string}
		
		const deviceSelectSource: AWJaction<DeviceSelectSource> = {
			name: 'Deprecated from V2 - Select Layer Source (please upgrade to new action V3)',
			sortName: '12 Deprecated from V2 - Select Layer Source',
			description: 'Deprecated - replaced by "Layer Properties - Source". Sets which source (Input, Image Store, Color, etc.) is shown by a Layer.',
			options: [
				{
					id: 'method',
					type: 'dropdown',
					label: 'Method',
					choices: [
						{ id: 'spec', label: 'Target specified layers' },
						{ id: 'sel', label: 'Target selected layers' },
					],
					default: 'spec',
					disableAutoExpression: true,
				},
				{
					id: 'screen',
					allowInvalidValues: true,
					type: 'multidropdown',
					label: 'Screen / Aux',
					choices: this.choices.getScreenAuxChoices(),
					default: [this.choices.getScreenAuxChoices()[0]?.id],
					isVisibleExpression: "$(options:method) == 'spec'",
					disableAutoExpression: true,
				},
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset (Program/Preview)',
					choices: this.choices.choicesPreset,
					allowInvalidValues: true,
					default: 'prw',
					isVisibleExpression: "$(options:method) == 'spec'",
				},
			],
			callback: () => {},
		}

		return deviceSelectSource
	}

	/**
	 * MARK: Layer Properties - Source (V3)
	 * Rebuilt from the deprecated "Select Layer Source" (V2) around a single shared "Screen / Aux" field and a
	 * single shared "Layer" field (both offering a "Selected ..." choice) instead of V2's "method" toggle plus one
	 * hidden per-screen Layer field. That per-screen-field-set generated by getScreensAuxArray() shrank/grew
	 * whenever a screen was enabled/disabled on the device, which triggered a Companion-core isVisibleExpression
	 * reliability bug (same one already fixed for "Layer Properties - Position & Size") - collapsing it into one
	 * field removes the cross-field dependency entirely, and as a bonus both fields are now genuinely
	 * expression-capable (no disableAutoExpression needed anywhere).
	 */
	get deviceSelectSourceV3() {
		type DeviceSelectSourceV3 = {screen: string, preset: string, layer: string, sourceLayer: string, sourceColor: number, unlockIfLocked: boolean, relockAfterChange: boolean}

		const deviceSelectSourceV3: AWJaction<DeviceSelectSourceV3> = {
			name: 'Layer Properties - Source',
			sortName: '04 Layer Properties - 01 Source',
			description: 'Sets which source (Input, Image Store, Color, Screen PGM reinsertion, or - for a background layer - a Background Set) a Layer shows.',
			options: [
				{
					id: 'screen',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screen / Aux',
					choices: [{ id: 'first', label: 'First/Only Selected Screen' }, { id: 'sel', label: 'All Selected Screens' }, ...this.choices.getScreenAuxChoices()],
					default: 'first',
				},
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset (Program/Preview)',
					choices: [{ id: 'sel', label: 'Selected Preset' }, ...this.choices.choicesPreset],
				allowInvalidValues: true,
					default: 'prw',
				},
				{
					id: 'layer',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Layer',
					choices: [{ id: 'first', label: 'First/Only Selected Layer' }, { id: 'sel', label: 'All Selected Layers' }, ...this.choices.getLayerChoices(this.choices.getMaxConfiguredLayerCount(), true)],
					default: 'first',
				},
				{ id: 'targetHeader', type: 'static-text', label: '', value: '---', disableAutoExpression: true },
				{
					// covers regular content layers (Color/Input/Image/Screen PGM) and background layers (Background
					// Set 1-8) alike in one list - which underlying command applies depends on which layer was picked
					// above, not on the value here, so an invalid combination (e.g. Background Set on a numbered
					// layer) is simply a no-op on the device
					id: 'sourceLayer',
					type: 'dropdown',
					label: 'Source',
					choices: [{ id: 'keep', label: "Don't change source" }, ...this.choices.getSourceChoices(), ...this.choices.choicesBackgroundSources],
					default: 'keep',
				},
				{
					// only actually sent when Source above is "Color" (regular layer) or "None" (background layer) -
					// see the "Send custom AWJ command" style TODO(isVisible-migration) note elsewhere in this file:
					// showing it unconditionally is the safe direction, since hiding a needed field is worse than
					// showing an unneeded one
					id: 'sourceColor',
					type: 'colorpicker',
					label: 'Color',
					default: 0xffffff,
				},
				{ id: 'additionalOptionsHeader', type: 'static-text', label: '', value: '---\n**Additional Options**', disableAutoExpression: true },
				{
					// module-only convenience, not present in WebRCS - added to every "Layer Properties" action since
					// users often don't notice a screen is locked, and a locked target silently doing nothing is confusing
					id: 'unlockIfLocked',
					type: 'checkbox',
					label: 'Unlock Screen if locked?',
					tooltip: 'Unlocks all affected screens before execution if they are locked.',
					default: false,
				},
				{
					id: 'relockAfterChange',
					type: 'checkbox',
					label: 'Relock after change',
					tooltip: 'Locks all affected screens after execution if they were previously locked.',
					default: false,
					isVisibleExpression: '$(options:unlockIfLocked) == true',
				},
			],
			callback: () => {},
		}

		return deviceSelectSourceV3
	}

	/**
	 * MARK: Set input keying
	 */
	get deviceInputKeying() {
		type DeviceInputKeying = {input: string, mode: string}
		
		const deviceInputKeying: AWJaction<DeviceInputKeying> = {
			name: 'Preconfig - Set Input Keying',
			sortName: '08 Preconfig - Set Input Keying',
			description: 'Sets an Input\'s own Chroma/Luma keying mode. This is the input-level keying setting, not the same as assigning a Keying preset to a Layer (see "Layer Properties - Keying").',
			options: [
				{
					id: 'input',
					type: 'dropdown',
					label: 'Input',
					choices: this.choices.getLiveInputChoices(),
					default: this.choices.getLiveInputChoices()[0]?.id,
				},
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Mode',
					choices: [
						{ id: 'DISABLE', label: 'Keying Disabled' },
						{ id: 'CHROMA', label: 'Chroma Key' },
						{ id: 'LUMA', label: 'Luma Key' },
					],
					default: 'DISABLE',
				},
			],
			callback: (action) => {
				this.connection.sendWSmessage(
					[
						'device',
						'inputList',
						'items',
						action.options.input,
						'plugList',
						'items',
						this.state.get('DEVICE/device/inputList/items/' + action.options.input + '/status/pp/plug'),
						'settings',
						'keying',
						'control',
						'pp',
						'mode',
					],
					action.options.mode
				)
				this.instance.sendXupdate()
			},
		}

		return deviceInputKeying
	}

	/**
	 * MARK: Change input freeze
	 */
	get deviceInputFreeze() {
		type DeviceInputFreeze = {input: string, mode: number}
		
		const deviceInputFreeze: AWJaction<DeviceInputFreeze> = {
			name: 'Freeze - Input',
			sortName: '06 Freeze - Input',
			description: 'Freezes, unfreezes, or toggles the freeze state of an Input\'s live signal.',
			options: [
				{
					id: 'input',
					type: 'dropdown',
					label: 'Input',
					choices: this.choices.getLiveInputChoices(),
					default: this.choices.getLiveInputChoices()[0]?.id,
				},
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Mode',
					choices: [
						{ id: 1, label: 'Freeze' },
						{ id: 0, label: 'Unfreeze' },
						{ id: 2, label: 'Toggle' },
					],
					default: 2,
				},
			],
			callback: (action) => {
				const input = action.options.input
				let val = false
				if (action.options.mode === 1) {
					val = true
				} else if (action.options.mode === 2) {
					val = !this.state.get('DEVICE/device/inputList/items/' + input + '/control/pp/freeze')
				}
				this.connection.sendWSmessage(['device', 'inputList', 'items', input, 'control', 'pp', 'freeze'], val)
			},
		}

		return deviceInputFreeze
	}

	/**
	 * MARK: Change layer freeze (Midra)
	 */
	get deviceLayerFreeze() {
		type DeviceLayerFreeze = {screen: string[], mode: number}
		
		const deviceLayerFreeze: AWJaction<DeviceLayerFreeze> = {
			name: 'Freeze - Layer',
			sortName: '06 Freeze - Layer',
			description: 'Freezes, unfreezes, or toggles the freeze state of one or more Layers (Midra only).',
			options: [
				{
					id: 'screen',
					allowInvalidValues: true,
					type: 'multidropdown',
					label: 'Screen',
					choices: this.choices.getScreenChoices(),
					default: [this.choices.getScreenChoices()[0]?.id],
					disableAutoExpression: true,
				},
				...this.choices.getScreensArray().map((screen) => {
					return {
						id: `layerS${screen.index}`,
						type: 'multidropdown' as const,
						label: 'Layer ' + screen.id,
						choices: [{id:'NATIVE', label: 'Background Layer'}, ...this.choices.getLayerChoices(screen.id, false)],
						default: ['1'],
						isVisibleExpression: `arrayIncludes($(options:screen), '${screen.id}')`,
					}
				}),
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Mode',
					choices: [
						{ id: 1, label: 'Freeze' },
						{ id: 0, label: 'Unfreeze' },
						{ id: 2, label: 'Toggle' },
					],
					default: 2,
				},
			],
			callback: (action) => {
				for (const screen of action.options.screen) {
					const screeninfo = this.choices.getScreenInfo(screen)
					for (const layer of action.options[`layer${screen}`]) {
						let val = false
						let path: string[] = [
							'device', 
							screeninfo.prefixverylong + 'List', 
							'items', screeninfo.numstr, 
						]
						if (layer === 'NATIVE') {
							path.push('background', 'control', 'pp', 'freeze')
						} else {
							path.push('liveLayerList', 'items', layer, 'control', 'pp', 'freeze')
						}
						if (action.options.mode === 1) {
							val = true
						} else if (action.options.mode === 2) {
							val = !this.state.get(['DEVICE', ...path])
						}
						this.connection.sendWSmessage(path, val)
					}
				}				
			},
		}

		return deviceLayerFreeze
	}

	/**
	 * MARK: Change screen freeze (Midra)
	 */
	get deviceScreenFreeze() {
		type DeviceScreenFreeze = {screen: string[], mode: number}
		
		const deviceScreenFreeze: AWJaction<DeviceScreenFreeze> = {
			name: 'Freeze - Screen',
			sortName: '06 Freeze - Screen',
			description: 'Freezes, unfreezes, or toggles the freeze state of one or more Screens/Auxscreens (Midra only).',
			options: [
				{
					id: 'screen',
					allowInvalidValues: true,
					type: 'multidropdown',
					label: 'Screen',
					choices: this.choices.getScreenAuxChoices(),
					default: [this.choices.getScreenAuxChoices()[0]?.id],
				},
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Mode',
					choices: [
						{ id: 1, label: 'Freeze' },
						{ id: 0, label: 'Unfreeze' },
						{ id: 2, label: 'Toggle' },
					],
					default: 2,
				},
			],
			callback: (action) => {
				for (const screen of action.options.screen) {
					const screeninfo = this.choices.getScreenInfo(screen)
					let val = false
					const path = [
						'device', 
						 screeninfo.prefixverylong + 'List',
						 'items', screeninfo.numstr, 
						 'control', 'pp', 'freeze']
					if (action.options.mode === 1) {
						val = true
					} else if (action.options.mode === 2) {
						val = !this.state.get(['DEVICE', ...path])
					}
					this.connection.sendWSmessage(path, val)	
				}				
			},
		} 

		return deviceScreenFreeze

	}

	/**
	 * MARK: Assign an image from the Image Library to an Image Store slot
	 */
	get deviceAssignImageLibraryToStore() {
		type DeviceAssignImageLibraryToStore = { store: string, source: string, allowDownscale: boolean }

		const deviceAssignImageLibraryToStore: AWJaction<DeviceAssignImageLibraryToStore> = {
			name: 'Preconfig - Assign Image from Library to Image Store',
			sortName: '08 Preconfig - Assign Image from Library to Image Store',
			description: 'Assigns an image from the Image Library (or a Timer) to an Image Store slot, so it becomes available as a Layer source.',
			options: [
				{
					id: 'store',
					type: 'dropdown',
					label: 'Image Slot',
					choices: this.choices.getStillStoreChoices(),
					default: this.choices.getStillStoreChoices()[0]?.id,
					allowInvalidValues: true,
				},
				{
					id: 'source',
					type: 'dropdown',
					label: 'Library Image / Timer',
					choices: this.choices.getStillTimerAndLibraryChoices(),
					default: this.choices.getStillTimerAndLibraryChoices()[0]?.id,
					allowInvalidValues: true,
				},
				{
					id: 'allowDownscale',
					type: 'checkbox',
					label: 'Allow Downscale',
					default: true,
				},
			],
			callback: (action) => {
				const store = action.options.store
				const source = action.options.source
				if (!store || !source) return
				const path = ['device', 'stillList', 'items', store, 'control', 'pp']
				if (source.startsWith('TIMER_')) {
					this.connection.sendWSmessage([...path, 'mode'], 'TIMER')
					this.connection.sendWSmessage([...path, 'timer'], source)
				} else {
					const library = Number(source)
					if (isNaN(library)) return
					this.connection.sendWSmessage([...path, 'mode'], 'IMAGE')
					this.connection.sendWSmessage([...path, 'source'], library)
				}
				this.connection.sendWSmessage([...path, 'rescale'], parseBoolean(action.options.allowDownscale) ? 'SCALE_TO_CAPABILITY' : 'NO_RESCALE')
			},
		}

		return deviceAssignImageLibraryToStore
	}

	/**
	 * MARK: Layer position and size V3
	 * Sends the given values 1:1 to the device (posH/posV/sizeH/sizeV) without any conversion, so the raw AWJ
	 * value is directly visible. An empty field leaves that value untouched. No anchor point, no aspect-ratio
	 * derivation, no cross-layer bounding box math - unlike the old (deprecated V2) action.
	 */
	get devicePositionSizeV3() {
		type DevicePositionSizeV3 = {screen: string, preset: string, layersel: string, anchor: AnchorPoint | 'sel', x: string, y: string, w: string, h: string, keepAspectRatio: boolean, refW: string, refH: string, unlockIfLocked: boolean, relockAfterChange: boolean} & Record<string, string>
		type LayerPositionData = {path: string[], posH: number, posV: number, sizeH: number, sizeV: number}

		const convertAnchorPosition = this.choices.convertAnchorPosition.bind(this.choices)

		const getLayerPositionData = (screenId: string, preset: string, layerId: string): LayerPositionData | undefined => {
			const screninfo = this.choices.getScreenInfo(screenId)
			const presetKey = this.choices.getPreset(screninfo.id, preset)
			const path = [
				...(screninfo.isAux ? this.constants.auxPath : this.constants.screenPath),
				'items', screninfo.platformId,
				'presetList', 'items', presetKey,
				...this.choices.getLayerPath(layerId)
			]

			if (this.state.get(['DEVICE', ...path, ...this.constants.propsSizePath]) === undefined) return undefined // this layer does not allow for sizing

			return {
				path,
				posH: this.state.get(['DEVICE', ...path, ...this.constants.propsPositionPath, 'posH']) ?? 0,
				posV: this.state.get(['DEVICE', ...path, ...this.constants.propsPositionPath, 'posV']) ?? 0,
				sizeH: this.state.get(['DEVICE', ...path, ...this.constants.propsSizePath, 'sizeH']) ?? 1920,
				sizeV: this.state.get(['DEVICE', ...path, ...this.constants.propsSizePath, 'sizeV']) ?? 1080,
			}
		}

		/** Resolves the "screen"/"layersel" options into concrete target layers. "First/Only Selected Screen" and
		 * "First/Only Selected Layer" each target just the first (Ctrl-clicked first in WebRCS, same screen/layer
		 * the SelectedScreen and SelectedLayer variables describe) of a multi-selection - safer than "all selected"
		 * for X/Y/W/H values that were read from those variables, since those only ever describe that one
		 * screen/layer, so applying them to every selected screen/layer could move layers you did not intend to
		 * touch. A single "Layer" field covers every screen choice (specific screen, "sel", or "first" alike) -
		 * there used to be one hidden field per screen instead, shown/hidden via isVisibleExpression depending on
		 * the "screen" field's value, but Companion's isVisibleExpression evaluation turned out to be unreliable
		 * for fields depending on another field that has disableAutoExpression set (as "screen" did, needed only
		 * for that now-removed cross-field dependency) - occasionally showing several of them at once instead of
		 * exactly one. Removing the dependency entirely sidesteps that, and as a bonus "screen" itself can now be
		 * expression-driven, which it couldn't while other fields depended on its value. */
		const resolveLayers = (opt: DevicePositionSizeV3): {screenAuxKey: string, layerKey: string}[] => {
			const targetScreens = opt.screen === 'first'
				? this.choices.getSelectedScreens().slice(0, 1)
				: opt.screen === 'sel'
					? this.choices.getSelectedScreens()
					: [opt.screen]
			if (opt.layersel === 'sel') return this.choices.getSelectedLayers().filter(layer => targetScreens.includes(layer.screenAuxKey))
			if (opt.layersel === 'first') return this.choices.getSelectedLayers().filter(layer => targetScreens.includes(layer.screenAuxKey)).slice(0, 1)
			return targetScreens.map(screenAuxKey => ({screenAuxKey, layerKey: opt.layersel}))
		}

		const devicePositionSizeV3: AWJaction<DevicePositionSizeV3> = {
			name: 'Layer Properties - Position & Size',
			sortName: '04 Layer Properties - 02 Position & Size',
			description: 'Sets a Layer\'s position and/or size in raw device units. An empty X/Y/Width/Height field leaves that value untouched. No aspect-ratio locking or anchor-relative math beyond the Anchor Point field itself.',
			options: [
				{
					id: 'screen',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screen / Aux',
					tooltip: 'When several screens/auxes are selected (common in daily use), "First/Only Selected Screen" targets just the first (Ctrl-clicked first in WebRCS, same screen the SelectedScreen.* variables describe) - safer than "All Selected Screens" for X/Y/W/H values that were read from those variables, since those only ever describe that one screen, so applying them to every selected screen could move layers on screens you did not intend to touch.',
					choices: [{ id: 'first', label: 'First/Only Selected Screen' }, { id: 'sel', label: 'All Selected Screens' }, ...this.choices.getScreenAuxChoices()],
					default: 'first',
				},
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset (Program/Preview)',
					choices: [{ id: 'sel', label: 'Selected Preset' }, ...this.choices.choicesPreset],
				allowInvalidValues: true,
					default: 'prw',
				},
				{
					id: `layersel`,
					type: 'dropdown',
					label: 'Layer',
					tooltip: 'When using "selected layer" and screen or preset are not using "Selected", you can narrow the selection. "First/Only Selected Layer" targets just the first (Ctrl-clicked first in WebRCS) of a multi-selection - safer to use when the X/Y/W/H values were read from the SelectedLayer.* variables, which also only ever describe that first layer, so applying them to every selected layer could move layers you did not intend to touch.',
					choices: [{ id: 'sel', label: 'All Selected Layers' }, { id: 'first', label: 'First/Only Selected Layer' }, ...Array.from({length: this.choices.getMaxConfiguredLayerCount()}, (_i, e:number) => {return {id: e+1, label: `Layer ${e+1}`}})],
					default: 'first',
				},
				{ id: 'targetHeader', type: 'static-text', label: '', value: '---', disableAutoExpression: true },
				{
					id: 'anchor',
					type: 'dropdown',
					label: 'Anchor Point',
					tooltip: 'Which point of the layer box the X/Y position refers to, exactly like the anchor point selector in WebRCS. "Center" is the raw AWJ posH/posV value directly (matches the previous, anchor-less behavior of this action). Picking a fixed point here also becomes the new globally selected Anchor Point (same as using the "Set Anchor Point" action), so WebRCS and the SelectedLayer.x/.y variables stay in sync with it.',
					choices: [{ id: 'sel', label: 'Use Global Anchor Point' }, ...this.choices.getAnchorPointChoices()],
					default: 'sel',
				},
				{
					id: 'x',
					type: 'textinput',
					label: 'X position (posH at chosen Anchor Point)',
					tooltip: 'Leave empty to not change this value. With Anchor Point = Center, this is the raw AWJ posH value, sent 1:1 without conversion.',
					default: '',
					useVariables: true,
				},
				{
					id: 'y',
					type: 'textinput',
					label: 'Y position (posV at chosen Anchor Point)',
					tooltip: 'Leave empty to not change this value. With Anchor Point = Center, this is the raw AWJ posV value, sent 1:1 without conversion.',
					default: '',
					useVariables: true,
				},
				{
					id: 'w',
					type: 'textinput',
					label: 'Width (sizeH, raw AWJ value)',
					tooltip: 'Leave empty to not change this value. Sent 1:1 to the device without any conversion.',
					default: '',
					useVariables: true,
				},
				{
					id: 'h',
					type: 'textinput',
					label: 'Height (sizeV, raw AWJ value)',
					tooltip: 'Leave empty to not change this value. Sent 1:1 to the device without any conversion.',
					default: '',
					useVariables: true,
				},
				{
					id: 'keepAspectRatio',
					type: 'checkbox',
					label: 'Keep Aspect Ratio if one value is empty',
					tooltip: 'If only one of Width/Height is given, derive the other from an aspect ratio (rounded). Has no effect if both or neither are given.',
					default: false,
				},
				{ id: 'additionalOptionsHeader', type: 'static-text', label: '', value: '---\n**Additional Options**', disableAutoExpression: true },
				{
					id: 'refW',
					type: 'textinput',
					label: 'Reference Width (optional)',
					tooltip: 'Only used together with Keep Aspect Ratio. If both Reference Width and Height are given, the aspect ratio is derived from these fixed values instead of the layer\'s current size. Important for repeated small steps (e.g. an encoder wheel): deriving from the ever-changing current size instead re-rounds on every step and drifts away from the true ratio over many steps - a fixed reference avoids that entirely. Leave both empty to derive from the current size (fine for a single change).',
					default: '',
					useVariables: true,
				},
				{
					id: 'refH',
					type: 'textinput',
					label: 'Reference Height (optional)',
					tooltip: 'See Reference Width.',
					default: '',
					useVariables: true,
				},
				{
					// module-only convenience, not present in WebRCS - added to every "Layer Properties" action since
					// users often don't notice a screen is locked, and a locked target silently doing nothing is confusing
					id: 'unlockIfLocked',
					type: 'checkbox',
					label: 'Unlock Screen if locked?',
					tooltip: 'Unlocks all affected screens before execution if they are locked.',
					default: false,
				},
				{
					id: 'relockAfterChange',
					type: 'checkbox',
					label: 'Relock after change',
					tooltip: 'Locks all affected screens after execution if they were previously locked.',
					default: false,
					isVisibleExpression: '$(options:unlockIfLocked) == true',
				},
			],
			learn: async (action) => {
				const options = action.options
				const newoptions: Partial<DevicePositionSizeV3> = {}

				const layers = resolveLayers(options)

				if (layers.length === 0) return undefined

				const preset = this.choices.getPresetSelection()
				const screeninfo = this.choices.getScreenInfo(layers[0].screenAuxKey)
				const laydata = getLayerPositionData(screeninfo.id, preset, layers[0].layerKey)
				if (laydata === undefined) return undefined

				newoptions.screen = screeninfo.id
				newoptions.layersel = layers[0].layerKey.replace(/^\w+_/, '')
				newoptions.preset = preset
				const anchor: AnchorPoint = (options.anchor === undefined || options.anchor === 'sel') ? this.choices.getGlobalAnchorPoint() : options.anchor
				const anchorPos = anchor === 'CENTER'
					? { x: laydata.posH, y: laydata.posV }
					: convertAnchorPosition(laydata.posH, laydata.posV, laydata.sizeH, laydata.sizeV, 'CENTER', anchor)
				newoptions.x = anchorPos.x.toString()
				newoptions.y = anchorPos.y.toString()
				newoptions.w = laydata.sizeH.toString()
				newoptions.h = laydata.sizeV.toString()

				return newoptions
			},
			callback: async (action) => {
				let layers = resolveLayers(action.options)

				const preset = action.options.preset === 'sel' ? this.choices.getPresetSelection('sel') : action.options.preset
				const unlockedScreens = new Set<string>()
				layers = layers.filter(layer => {
					if (!layer.layerKey.match(/^\d+$/)) return false // wipe out native layer
					if (this.choices.isLocked(layer.screenAuxKey, preset)) {
						if (!parseBoolean(action.options.unlockIfLocked)) return false
						if (!unlockedScreens.has(layer.screenAuxKey)) {
							this.choices.setScreenLock(layer.screenAuxKey, preset, false)
							unlockedScreens.add(layer.screenAuxKey)
						}
					}
					return true
				})
				if (layers.length === 0) return

				let anchor: AnchorPoint
				if (action.options.anchor === 'sel' || action.options.anchor === undefined) {
					anchor = this.choices.getGlobalAnchorPoint()
				} else {
					anchor = action.options.anchor
					if (anchor !== this.choices.getGlobalAnchorPoint()) {
						this.connection.sendWSdata('REMOTE', 'setAnchorPoint', '/live/screens/layers', [anchor])
					}
				}

				const keepAspectRatio = parseBoolean(action.options.keepAspectRatio)
				// A fixed reference avoids rounding drift over many repeated small steps (e.g. an encoder
				// wheel): deriving from the layer's ever-changing current size instead re-rounds on every
				// single step, each time starting from the previous step's already-rounded result rather
				// than the true original ratio, so the error compounds. With a fixed reference every step
				// derives from the exact same ratio, so it can't drift no matter how many steps there are.
				const refWGiven = action.options.refW !== '' && !isNaN(Number(action.options.refW)) && Number(action.options.refW) > 0
				const refHGiven = action.options.refH !== '' && !isNaN(Number(action.options.refH)) && Number(action.options.refH) > 0
				const hasFixedRatio = refWGiven && refHGiven

				for (const layer of layers) {
					const laydata = getLayerPositionData(layer.screenAuxKey, preset, layer.layerKey)
					if (laydata === undefined) continue // this layer does not allow for sizing

					const ratioSizeH = hasFixedRatio ? Number(action.options.refW) : laydata.sizeH
					const ratioSizeV = hasFixedRatio ? Number(action.options.refH) : laydata.sizeV

					const wGiven = action.options.w !== '' && !isNaN(Number(action.options.w))
					const hGiven = action.options.h !== '' && !isNaN(Number(action.options.h))
					let targetSizeH = wGiven ? Math.round(Number(action.options.w)) : laydata.sizeH
					let targetSizeV = hGiven ? Math.round(Number(action.options.h)) : laydata.sizeV
					// "Keep Aspect Ratio" only kicks in when exactly one of Width/Height was actually given -
					// with both given the user's explicit values always win, with neither given there is nothing to derive.
					if (keepAspectRatio && ratioSizeH !== 0 && ratioSizeV !== 0) {
						if (wGiven && !hGiven) targetSizeV = Math.round(targetSizeH * ratioSizeV / ratioSizeH)
						else if (hGiven && !wGiven) targetSizeH = Math.round(targetSizeV * ratioSizeH / ratioSizeV)
					}
					const sizeChanges = wGiven || (keepAspectRatio && hGiven)
					const sizeVChanges = hGiven || (keepAspectRatio && wGiven)

					const xGiven = action.options.x !== '' && !isNaN(Number(action.options.x))
					const yGiven = action.options.y !== '' && !isNaN(Number(action.options.y))

					let newPosH: number | undefined
					let newPosV: number | undefined
					if (xGiven || yGiven) {
						// The anchor point refers to the box AFTER this call's resize (if any), not its current size.
						const rawX = xGiven ? Math.round(Number(action.options.x)) : 0
						const rawY = yGiven ? Math.round(Number(action.options.y)) : 0
						const centerPos = anchor === 'CENTER'
							? { x: rawX, y: rawY }
							: convertAnchorPosition(rawX, rawY, targetSizeH, targetSizeV, anchor, 'CENTER')
						if (xGiven) newPosH = centerPos.x
						if (yGiven) newPosV = centerPos.y
					}
					// Resizing without an explicit new position would otherwise always grow/shrink the box
					// around AWJ's native center point (posH/posV), no matter which Anchor Point is chosen -
					// since that's what leaving posH/posV untouched literally means at the protocol level.
					// To make a non-Center anchor actually behave like an anchor (its own point of the box
					// stays put while the opposite side moves), re-derive the position needed to keep that
					// same anchor point fixed at its current location whenever the size is actually changing.
					// At Center this is a no-op by construction (Center -> Center conversion never moves
					// anything), matching "only grows symmetrically when the anchor is Center".
					if (anchor !== 'CENTER' && (targetSizeH !== laydata.sizeH || targetSizeV !== laydata.sizeV)) {
						const currentAnchorPos = convertAnchorPosition(laydata.posH, laydata.posV, laydata.sizeH, laydata.sizeV, 'CENTER', anchor)
						const compensatedPos = convertAnchorPosition(currentAnchorPos.x, currentAnchorPos.y, targetSizeH, targetSizeV, anchor, 'CENTER')
						if (newPosH === undefined) newPosH = compensatedPos.x
						if (newPosV === undefined) newPosV = compensatedPos.y
					}

					if (newPosH !== undefined && newPosH !== laydata.posH) {
						this.state.set(['DEVICE', ...laydata.path, ...this.constants.propsPositionPath, 'posH'], newPosH)
						this.connection.sendWSmessage([...laydata.path, ...this.constants.propsPositionPath, 'posH'], newPosH)
					}
					if (newPosV !== undefined && newPosV !== laydata.posV) {
						this.state.set(['DEVICE', ...laydata.path, ...this.constants.propsPositionPath, 'posV'], newPosV)
						this.connection.sendWSmessage([...laydata.path, ...this.constants.propsPositionPath, 'posV'], newPosV)
					}
					if (sizeChanges) {
						const sizeH = targetSizeH
						if (sizeH !== laydata.sizeH) {
							this.state.set(['DEVICE', ...laydata.path, ...this.constants.propsSizePath, 'sizeH'], sizeH)
							this.connection.sendWSmessage([...laydata.path, ...this.constants.propsSizePath, 'sizeH'], sizeH)
						}
					}
					if (sizeVChanges) {
						const sizeV = targetSizeV
						if (sizeV !== laydata.sizeV) {
							this.state.set(['DEVICE', ...laydata.path, ...this.constants.propsSizePath, 'sizeV'], sizeV)
							this.connection.sendWSmessage([...laydata.path, ...this.constants.propsSizePath, 'sizeV'], sizeV)
						}
					}
				}

				if (parseBoolean(action.options.relockAfterChange)) {
					for (const screenAuxKey of unlockedScreens) {
						this.choices.setScreenLock(screenAuxKey, preset, true)
					}
				}
				this.instance.sendXupdate()
			},
		}

		return devicePositionSizeV3

	}

	/**
	 * MARK: Layer Properties - Transitions (V3, placeholder - not yet implemented)
	 */
	get deviceLayerTransitionsV3() {
		type DeviceLayerTransitionsV3 = {
			screen: string, preset: string, layersel: string,
			openingType: string, openingWay: string, closingType: string, closingWay: string,
			allowCrossEffect: string, allowCrossDepth: string, flyingCurve: string,
			unlockIfLocked: boolean, relockAfterChange: boolean,
		}

		// Enum values confirmed live (2026-08-27) from WebRCS's own bundle (VAR_ENUMS: ELEMENT_TRANSITION,
		// TRANSITION_WAY, PE_FLYING_TYPE, PE_TRANSITION_FLAGS) against a real Aquilon (192.168.20.112)
		const transitionTypeChoices = [
			{ id: 'CUT', label: 'Cut' },
			{ id: 'FADE', label: 'Fade' },
			{ id: 'SLIDE', label: 'Slide' },
			{ id: 'WIPE', label: 'Wipe' },
			{ id: 'CIRCLE', label: 'Circle' },
			{ id: 'STRETCH', label: 'Stretch' },
			{ id: 'WIPE_ADVANCED', label: 'Wipe 2' },
		]
		const transitionWayChoices = [
			{ id: 'LEFT_TO_RIGHT', label: 'Left to Right' },
			{ id: 'RIGHT_TO_LEFT', label: 'Right to Left' },
			{ id: 'BOTTOM_TO_UP', label: 'Bottom to Up' },
			{ id: 'UP_TO_BOTTOM', label: 'Up to Bottom' },
			{ id: 'V_FROM_TO_CENTER', label: 'Vertical from/to Center' },
			{ id: 'H_FROM_TO_CENTER', label: 'Horizontal from/to Center' },
			{ id: 'HV_FROM_TO_CENTER', label: 'Horizontal + Vertical from/to Center' },
			{ id: 'SW_TO_NE', label: 'SW to NE' },
			{ id: 'SE_TO_NW', label: 'SE to NW' },
			{ id: 'NW_TO_SE', label: 'NW to SE' },
			{ id: 'NE_TO_SW', label: 'NE to SW' },
		]
		const flyingCurveChoices = [
			{ id: 'LINEAR', label: 'Linear' },
			{ id: 'BEZIER_1PT', label: 'Bezier (1 point)' },
			{ id: 'BEZIER_2PT', label: 'Bezier (2 points)' },
			{ id: 'DEVIANT_CLOCKWISE', label: 'Deviant Clockwise' },
			{ id: 'DEVIANT_ANTICLOCKWISE', label: 'Deviant Anticlockwise' },
		]

		const resolveLayers = (opt: {screen: string, layersel: string}): {screenAuxKey: string, layerKey: string}[] => {
			const targetScreens = opt.screen === 'first'
				? this.choices.getSelectedScreens().slice(0, 1)
				: opt.screen === 'sel'
					? this.choices.getSelectedScreens()
					// still supports a concatenated multi-selection like "S1A1" via expression, same convention as elsewhere in the module
					: this.choices.getChosenScreenAuxes(opt.screen)
			if (opt.layersel === 'sel') return this.choices.getSelectedLayers().filter(layer => targetScreens.includes(layer.screenAuxKey))
			if (opt.layersel === 'first') return this.choices.getSelectedLayers().filter(layer => targetScreens.includes(layer.screenAuxKey)).slice(0, 1)
			return targetScreens.map(screenAuxKey => ({screenAuxKey, layerKey: opt.layersel}))
		}

		const deviceLayerTransitionsV3: AWJaction<DeviceLayerTransitionsV3> = {
			name: 'Layer Properties - Transitions',
			sortName: '04 Layer Properties - 03 Transitions',
			description: 'Sets a Layer\'s Opening/Closing transition - the type, direction and Flying Curve used when it animates in or out.',
			options: [
				{
					id: 'screen',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screen / Aux',
					choices: [{ id: 'first', label: 'First/Only Selected Screen' }, { id: 'sel', label: 'All Selected Screens' }, ...this.choices.getScreenAuxChoices()],
					default: 'first',
				},
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset (Program/Preview)',
					choices: [{ id: 'sel', label: 'Selected Preset' }, ...this.choices.choicesPreset],
				allowInvalidValues: true,
					default: 'prw',
				},
				{
					id: 'layersel',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Layer',
					choices: [{ id: 'first', label: 'First/Only Selected Layer' }, { id: 'sel', label: 'All Selected Layers' }, ...Array.from({length: this.choices.getMaxConfiguredLayerCount()}, (_i, e: number) => ({id: (e + 1).toString(), label: `Layer ${e + 1}`}))],
					default: 'first',
				},
				{ id: 'openingHeader', type: 'static-text', label: '', value: '---\n**Opening Transition**', disableAutoExpression: true },
				{
					id: 'openingType',
					type: 'dropdown',
					label: 'Type',
					choices: [{ id: 'keep', label: "Don't change" }, ...transitionTypeChoices],
					default: 'keep',
				},
				{
					id: 'openingWay',
					type: 'dropdown',
					label: 'Direction',
					choices: [{ id: 'keep', label: "Don't change" }, ...transitionWayChoices],
					default: 'keep',
				},
				{ id: 'closingHeader', type: 'static-text', label: '', value: '---\n**Closing Transition**', disableAutoExpression: true },
				{
					id: 'closingType',
					type: 'dropdown',
					label: 'Type',
					choices: [{ id: 'keep', label: "Don't change" }, ...transitionTypeChoices],
					default: 'keep',
				},
				{
					id: 'closingWay',
					type: 'dropdown',
					label: 'Direction',
					choices: [{ id: 'keep', label: "Don't change" }, ...transitionWayChoices],
					default: 'keep',
				},
				{ id: 'optionsHeader', type: 'static-text', label: '', value: '---\n**Options**', disableAutoExpression: true },
				{
					// NOT verified live yet (deliberately built ahead of verification, to be corrected once measured -
					// see project memory). The device stores this as a single PE_TRANSITION_FLAGS array
					// (device/.../transition/pp/flags), not two independent settings - best-guess mapping used here:
					// Off -> FORCE_TRANSITION, On -> FORCE_CROSS. "Don't change" leaves the whole flags array alone
					// (merged with Allow Cross Depth below only when that one actually changes something).
					id: 'allowCrossEffect',
					type: 'dropdown',
					label: 'Allow Cross Effect',
					choices: [{ id: 'keep', label: "Don't change" }, { id: 'off', label: 'Off' }, { id: 'on', label: 'On' }],
					default: 'keep',
				},
				{
					// NOT verified live yet - same flags array as above. Off is guessed to add one of the three
					// DEPTH_CUT_* flags (START/MIDDLE/END); which exact one WebRCS actually uses is unconfirmed -
					// currently guessing DEPTH_CUT_MIDDLE. On removes any DEPTH_CUT_* flag (smooth/"cross" depth change).
					id: 'allowCrossDepth',
					type: 'dropdown',
					label: 'Allow Cross Depth',
					choices: [{ id: 'keep', label: "Don't change" }, { id: 'off', label: 'Off' }, { id: 'on', label: 'On' }],
					default: 'keep',
				},
				{ id: 'flyingHeader', type: 'static-text', label: '', value: '---\n**Flying Curve**', disableAutoExpression: true },
				{
					id: 'flyingCurve',
					type: 'dropdown',
					label: 'Type',
					choices: [{ id: 'keep', label: "Don't change" }, ...flyingCurveChoices],
					default: 'keep',
				},
				{ id: 'additionalOptionsHeader', type: 'static-text', label: '', value: '---\n**Additional Options**', disableAutoExpression: true },
				{
					// module-only convenience, not present in WebRCS - added to every "Layer Properties" action since
					// users often don't notice a screen is locked, and a locked target silently doing nothing is confusing
					id: 'unlockIfLocked',
					type: 'checkbox',
					label: 'Unlock Screen if locked?',
					tooltip: 'Unlocks all affected screens before execution if they are locked.',
					default: false,
				},
				{
					id: 'relockAfterChange',
					type: 'checkbox',
					label: 'Relock after change',
					tooltip: 'Locks all affected screens after execution if they were previously locked.',
					default: false,
					isVisibleExpression: '$(options:unlockIfLocked) == true',
				},
			],
			// "Get current values" (Companion's standard blue "Learn" button) - reads the first resolved layer's
			// current transition/flying settings and pins screen/preset/layer to the concrete values it read from.
			learn: (action) => {
				const layers = resolveLayers(action.options).filter(layer => layer.layerKey.match(/^\d+$/))
				if (layers.length === 0) return undefined

				const preset = this.choices.getPresetSelection()
				const screenInfo = this.choices.getScreenInfo(layers[0].screenAuxKey)
				const path = [
					...(screenInfo.isAux ? this.constants.auxPath : this.constants.screenPath),
					'items', screenInfo.platformId,
					'presetList', 'items', this.choices.getPreset(screenInfo.id, preset),
					...this.choices.getLayerPath(layers[0].layerKey),
				]

				const newoptions: Partial<DeviceLayerTransitionsV3> = {
					screen: screenInfo.id,
					layersel: layers[0].layerKey,
					preset,
				}
				const openingType = this.state.get(['DEVICE', ...path, 'transition', 'opening', 'pp', 'type'])
				if (typeof openingType === 'string') newoptions.openingType = openingType
				const openingWay = this.state.get(['DEVICE', ...path, 'transition', 'opening', 'pp', 'way'])
				if (typeof openingWay === 'string') newoptions.openingWay = openingWay
				const closingType = this.state.get(['DEVICE', ...path, 'transition', 'closing', 'pp', 'type'])
				if (typeof closingType === 'string') newoptions.closingType = closingType
				const closingWay = this.state.get(['DEVICE', ...path, 'transition', 'closing', 'pp', 'way'])
				if (typeof closingWay === 'string') newoptions.closingWay = closingWay

				const flags: string[] | undefined = this.state.get(['DEVICE', ...path, 'transition', 'pp', 'flags'])
				if (Array.isArray(flags)) {
					newoptions.allowCrossEffect = flags.includes('FORCE_CROSS') ? 'on' : flags.includes('FORCE_TRANSITION') ? 'off' : 'keep'
					newoptions.allowCrossDepth = flags.some(f => f.startsWith('DEPTH_CUT_')) ? 'off' : 'on'
				}

				const flyingCurve = this.state.get(['DEVICE', ...path, 'flying', 'pp', 'type'])
				if (typeof flyingCurve === 'string') newoptions.flyingCurve = flyingCurve

				return newoptions
			},
			callback: (action) => {
				const preset = action.options.preset === 'sel' ? this.choices.getPresetSelection('sel') : action.options.preset
				const unlockedScreens = new Set<string>()
				const layers = resolveLayers(action.options)
					.filter(layer => layer.layerKey.match(/^\d+$/)) // transitions/flying only apply to numbered content layers
					.filter(layer => {
						if (this.choices.isLocked(layer.screenAuxKey, preset)) {
							if (!parseBoolean(action.options.unlockIfLocked)) return false
							if (!unlockedScreens.has(layer.screenAuxKey)) {
								this.choices.setScreenLock(layer.screenAuxKey, preset, false)
								unlockedScreens.add(layer.screenAuxKey)
							}
						}
						return true
					})

				for (const layer of layers) {
					const screenInfo = this.choices.getScreenInfo(layer.screenAuxKey)
					const path = [
						...(screenInfo.isAux ? this.constants.auxPath : this.constants.screenPath),
						'items', screenInfo.platformId,
						'presetList', 'items', this.choices.getPreset(layer.screenAuxKey, preset),
						...this.choices.getLayerPath(layer.layerKey),
					]
					if (action.options.openingType !== 'keep') this.connection.sendWSmessage([...path, 'transition', 'opening', 'pp', 'type'], action.options.openingType)
					if (action.options.openingWay !== 'keep') this.connection.sendWSmessage([...path, 'transition', 'opening', 'pp', 'way'], action.options.openingWay)
					if (action.options.closingType !== 'keep') this.connection.sendWSmessage([...path, 'transition', 'closing', 'pp', 'type'], action.options.closingType)
					if (action.options.closingWay !== 'keep') this.connection.sendWSmessage([...path, 'transition', 'closing', 'pp', 'way'], action.options.closingWay)
					// only touches the flags array at all if at least one of Allow Cross Effect/Depth actually
					// changed - the untouched half is preserved from the layer's current live flags
					if (action.options.allowCrossEffect !== 'keep' || action.options.allowCrossDepth !== 'keep') {
						let flags: string[] = this.state.get(['DEVICE', ...path, 'transition', 'pp', 'flags']) ?? []
						if (action.options.allowCrossEffect !== 'keep') {
							flags = flags.filter(f => f !== 'FORCE_TRANSITION' && f !== 'FORCE_CROSS')
							flags.push(action.options.allowCrossEffect === 'on' ? 'FORCE_CROSS' : 'FORCE_TRANSITION')
						}
						if (action.options.allowCrossDepth !== 'keep') {
							flags = flags.filter(f => !f.startsWith('DEPTH_CUT_'))
							if (action.options.allowCrossDepth === 'off') flags.push('DEPTH_CUT_MIDDLE')
						}
						this.connection.sendWSmessage([...path, 'transition', 'pp', 'flags'], flags)
					}
					if (action.options.flyingCurve !== 'keep') this.connection.sendWSmessage([...path, 'flying', 'pp', 'type'], action.options.flyingCurve)
				}

				if (parseBoolean(action.options.relockAfterChange)) {
					for (const screenAuxKey of unlockedScreens) {
						this.choices.setScreenLock(screenAuxKey, preset, true)
					}
				}
				this.instance.sendXupdate()
			},
		}

		return deviceLayerTransitionsV3
	}

	/**
	 * MARK: Layer Properties - Keying (V3, placeholder - not yet implemented)
	 */
	get deviceLayerKeyingV3() {
		type DeviceLayerKeyingV3 = {screen: string, preset: string, layersel: string, enable: string, keyingPreset: string, unlockIfLocked: boolean, relockAfterChange: boolean}

		if (!this.isFirmwareAtLeast(6)) {
			return {
				name: 'Layer Properties - Keying',
				sortName: '04 Layer Properties - 04 Keying',
				description: 'Applies an existing Keying preset (from the Keyer Bank) to a layer. Creating/editing the presets themselves is done in WebRCS, not here.',
				options: this.firmwareGateOptions('V6'),
				callback: () => {},
			}
		}

		const resolveLayers = (opt: {screen: string, layersel: string}): {screenAuxKey: string, layerKey: string}[] => {
			const targetScreens = opt.screen === 'first'
				? this.choices.getSelectedScreens().slice(0, 1)
				: opt.screen === 'sel'
					? this.choices.getSelectedScreens()
					// still supports a concatenated multi-selection like "S1A1" via expression, same convention as elsewhere in the module
					: this.choices.getChosenScreenAuxes(opt.screen)
			if (opt.layersel === 'sel') return this.choices.getSelectedLayers().filter(layer => targetScreens.includes(layer.screenAuxKey))
			if (opt.layersel === 'first') return this.choices.getSelectedLayers().filter(layer => targetScreens.includes(layer.screenAuxKey)).slice(0, 1)
			return targetScreens.map(screenAuxKey => ({screenAuxKey, layerKey: opt.layersel}))
		}

		const deviceLayerKeyingV3: AWJaction<DeviceLayerKeyingV3> = {
			name: 'Layer Properties - Keying',
			sortName: '04 Layer Properties - 04 Keying',
			description: 'Applies an existing Keying preset (from the Keyer Bank) to a layer. Creating/editing the presets themselves is done in WebRCS, not here.',
			options: [
				{
					id: 'screen',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screen / Aux',
					choices: [{ id: 'first', label: 'First/Only Selected Screen' }, { id: 'sel', label: 'All Selected Screens' }, ...this.choices.getScreenAuxChoices()],
					default: 'first',
				},
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset (Program/Preview)',
					choices: [{ id: 'sel', label: 'Selected Preset' }, ...this.choices.choicesPreset],
				allowInvalidValues: true,
					default: 'prw',
				},
				{
					id: 'layersel',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Layer',
					choices: [{ id: 'first', label: 'First/Only Selected Layer' }, { id: 'sel', label: 'All Selected Layers' }, ...Array.from({length: this.choices.getMaxConfiguredLayerCount()}, (_i, e: number) => ({id: (e + 1).toString(), label: `Layer ${e + 1}`}))],
					default: 'first',
				},
				{ id: 'targetHeader', type: 'static-text', label: '', value: '---', disableAutoExpression: true },
				{
					id: 'enable',
					type: 'dropdown',
					label: 'Keying',
					choices: [{ id: 'keep', label: "Don't change" }, { id: 'off', label: 'Off' }, { id: 'on', label: 'On' }],
					default: 'keep',
				},
				{
					id: 'keyingPreset',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Keying Preset',
					choices: [{ id: 'keep', label: "Don't change" }, { id: 'NONE', label: 'None' }, ...this.choices.getKeyingPresetChoices()],
					default: 'keep',
				},
				{ id: 'additionalOptionsHeader', type: 'static-text', label: '', value: '---\n**Additional Options**', disableAutoExpression: true },
				{
					// module-only convenience, not present in WebRCS - added to every "Layer Properties" action since
					// users often don't notice a screen is locked, and a locked target silently doing nothing is confusing
					id: 'unlockIfLocked',
					type: 'checkbox',
					label: 'Unlock Screen if locked?',
					tooltip: 'Unlocks all affected screens before execution if they are locked.',
					default: false,
				},
				{
					id: 'relockAfterChange',
					type: 'checkbox',
					label: 'Relock after change',
					tooltip: 'Locks all affected screens after execution if they were previously locked.',
					default: false,
					isVisibleExpression: '$(options:unlockIfLocked) == true',
				},
			],
			// "Get current values" (Companion's standard blue "Learn" button) - reads the first resolved layer's
			// current keying state and pins screen/preset/layer to the concrete values it read from.
			learn: (action) => {
				const layers = resolveLayers(action.options).filter(layer => layer.layerKey.match(/^\d+$/))
				if (layers.length === 0) return undefined

				const preset = this.choices.getPresetSelection()
				const screenInfo = this.choices.getScreenInfo(layers[0].screenAuxKey)
				const path = [
					...(screenInfo.isAux ? this.constants.auxPath : this.constants.screenPath),
					'items', screenInfo.platformId,
					'presetList', 'items', this.choices.getPreset(screenInfo.id, preset),
					...this.choices.getLayerPath(layers[0].layerKey),
				]

				const newoptions: Partial<DeviceLayerKeyingV3> = {
					screen: screenInfo.id,
					layersel: layers[0].layerKey,
					preset,
				}
				const enable = this.state.get(['DEVICE', ...path, 'keying', 'pp', 'enable'])
				if (typeof enable === 'boolean') newoptions.enable = enable ? 'on' : 'off'
				const source = this.state.get(['DEVICE', ...path, 'keying', 'pp', 'source'])
				if (typeof source === 'string') newoptions.keyingPreset = source

				return newoptions
			},
			callback: (action) => {
				const preset = action.options.preset === 'sel' ? this.choices.getPresetSelection('sel') : action.options.preset
				const unlockedScreens = new Set<string>()
				const layers = resolveLayers(action.options)
					.filter(layer => layer.layerKey.match(/^\d+$/)) // keying only applies to numbered content layers, not background
					.filter(layer => {
						if (this.choices.isLocked(layer.screenAuxKey, preset)) {
							if (!parseBoolean(action.options.unlockIfLocked)) return false
							if (!unlockedScreens.has(layer.screenAuxKey)) {
								this.choices.setScreenLock(layer.screenAuxKey, preset, false)
								unlockedScreens.add(layer.screenAuxKey)
							}
						}
						return true
					})

				for (const layer of layers) {
					const screenInfo = this.choices.getScreenInfo(layer.screenAuxKey)
					const path = [
						...(screenInfo.isAux ? this.constants.auxPath : this.constants.screenPath),
						'items', screenInfo.platformId,
						'presetList', 'items', this.choices.getPreset(layer.screenAuxKey, preset),
						...this.choices.getLayerPath(layer.layerKey),
					]
					if (action.options.enable !== 'keep') this.connection.sendWSmessage([...path, 'keying', 'pp', 'enable'], action.options.enable === 'on')
					if (action.options.keyingPreset !== 'keep') this.connection.sendWSmessage([...path, 'keying', 'pp', 'source'], action.options.keyingPreset)
				}

				if (parseBoolean(action.options.relockAfterChange)) {
					for (const screenAuxKey of unlockedScreens) {
						this.choices.setScreenLock(screenAuxKey, preset, true)
					}
				}
				this.instance.sendXupdate()
			},
		}

		return deviceLayerKeyingV3
	}

	/**
	 * MARK: Layer Properties - Opacity (V3, placeholder - not yet implemented)
	 */
	get deviceLayerOpacityV3() {
		type DeviceLayerOpacityV3 = {screen: string, preset: string, layersel: string, opacity: number, unlockIfLocked: boolean, relockAfterChange: boolean}

		const resolveLayers = (opt: {screen: string, layersel: string}): {screenAuxKey: string, layerKey: string}[] => {
			const targetScreens = opt.screen === 'first'
				? this.choices.getSelectedScreens().slice(0, 1)
				: opt.screen === 'sel'
					? this.choices.getSelectedScreens()
					// still supports a concatenated multi-selection like "S1A1" via expression, same convention as elsewhere in the module
					: this.choices.getChosenScreenAuxes(opt.screen)
			if (opt.layersel === 'sel') return this.choices.getSelectedLayers().filter(layer => targetScreens.includes(layer.screenAuxKey))
			if (opt.layersel === 'first') return this.choices.getSelectedLayers().filter(layer => targetScreens.includes(layer.screenAuxKey)).slice(0, 1)
			return targetScreens.map(screenAuxKey => ({screenAuxKey, layerKey: opt.layersel}))
		}

		const deviceLayerOpacityV3: AWJaction<DeviceLayerOpacityV3> = {
			name: 'Layer Properties - Opacity',
			sortName: '04 Layer Properties - 05 Opacity',
			description: 'Sets a Layer\'s opacity, on the raw 0-256 scale WebRCS itself uses (256 = fully opaque).',
			options: [
				{
					id: 'screen',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screen / Aux',
					choices: [{ id: 'first', label: 'First/Only Selected Screen' }, { id: 'sel', label: 'All Selected Screens' }, ...this.choices.getScreenAuxChoices()],
					default: 'first',
				},
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset (Program/Preview)',
					choices: [{ id: 'sel', label: 'Selected Preset' }, ...this.choices.choicesPreset],
				allowInvalidValues: true,
					default: 'prw',
				},
				{
					id: 'layersel',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Layer',
					choices: [{ id: 'first', label: 'First/Only Selected Layer' }, { id: 'sel', label: 'All Selected Layers' }, ...Array.from({length: this.choices.getMaxConfiguredLayerCount()}, (_i, e: number) => ({id: (e + 1).toString(), label: `Layer ${e + 1}`}))],
					default: 'first',
				},
				{ id: 'targetHeader', type: 'static-text', label: '', value: '---', disableAutoExpression: true },
				{ id: 'opacityNote', type: 'static-text', label: '', value: 'Please select "-1" for "Don\'t change".', disableAutoExpression: true },
				{
					id: 'opacity',
					type: 'number',
					label: 'Opacity',
					tooltip: 'Same raw scale WebRCS itself uses - 256 = fully opaque (confirmed live). Defaults to -1, meaning "don\'t change" - drag away from the left end to set a real value.',
					min: -1,
					max: 256,
					step: 1,
					range: true,
					default: -1,
				},
				{ id: 'additionalOptionsHeader', type: 'static-text', label: '', value: '---\n**Additional Options**', disableAutoExpression: true },
				{
					// module-only convenience, not present in WebRCS - added to every "Layer Properties" action since
					// users often don't notice a screen is locked, and a locked target silently doing nothing is confusing
					id: 'unlockIfLocked',
					type: 'checkbox',
					label: 'Unlock Screen if locked?',
					tooltip: 'Unlocks all affected screens before execution if they are locked.',
					default: false,
				},
				{
					id: 'relockAfterChange',
					type: 'checkbox',
					label: 'Relock after change',
					tooltip: 'Locks all affected screens after execution if they were previously locked.',
					default: false,
					isVisibleExpression: '$(options:unlockIfLocked) == true',
				},
			],
			// "Get current values" (Companion's standard blue "Learn" button) - reads the first resolved layer's
			// current opacity and pins screen/preset/layer to the concrete values it read from.
			learn: (action) => {
				const layers = resolveLayers(action.options).filter(layer => layer.layerKey.match(/^\d+$/))
				if (layers.length === 0) return undefined

				const preset = this.choices.getPresetSelection()
				const screenInfo = this.choices.getScreenInfo(layers[0].screenAuxKey)
				const path = [
					...(screenInfo.isAux ? this.constants.auxPath : this.constants.screenPath),
					'items', screenInfo.platformId,
					'presetList', 'items', this.choices.getPreset(screenInfo.id, preset),
					...this.choices.getLayerPath(layers[0].layerKey),
				]

				const newoptions: Partial<DeviceLayerOpacityV3> = {
					screen: screenInfo.id,
					layersel: layers[0].layerKey,
					preset,
				}
				const opacity = this.state.get(['DEVICE', ...path, 'opacity', 'pp', 'opacity'])
				if (typeof opacity === 'number') newoptions.opacity = opacity

				return newoptions
			},
			callback: (action) => {
				const rawOpacity = Number(action.options.opacity) >= 0 ? Math.round(Math.min(256, Number(action.options.opacity))) : undefined

				const preset = action.options.preset === 'sel' ? this.choices.getPresetSelection('sel') : action.options.preset
				const unlockedScreens = new Set<string>()
				const layers = resolveLayers(action.options)
					.filter(layer => layer.layerKey.match(/^\d+$/)) // opacity only applies to numbered content layers, not background
					.filter(layer => {
						if (this.choices.isLocked(layer.screenAuxKey, preset)) {
							if (!parseBoolean(action.options.unlockIfLocked)) return false
							if (!unlockedScreens.has(layer.screenAuxKey)) {
								this.choices.setScreenLock(layer.screenAuxKey, preset, false)
								unlockedScreens.add(layer.screenAuxKey)
							}
						}
						return true
					})

				if (rawOpacity !== undefined) {
					for (const layer of layers) {
						const screenInfo = this.choices.getScreenInfo(layer.screenAuxKey)
						const path = [
							...(screenInfo.isAux ? this.constants.auxPath : this.constants.screenPath),
							'items', screenInfo.platformId,
							'presetList', 'items', this.choices.getPreset(layer.screenAuxKey, preset),
							...this.choices.getLayerPath(layer.layerKey),
						]
						this.connection.sendWSmessage([...path, 'opacity', 'pp', 'opacity'], rawOpacity)
					}
				}

				if (parseBoolean(action.options.relockAfterChange)) {
					for (const screenAuxKey of unlockedScreens) {
						this.choices.setScreenLock(screenAuxKey, preset, true)
					}
				}
				this.instance.sendXupdate()
			},
		}

		return deviceLayerOpacityV3
	}

	/**
	 * MARK: Layer Properties - Aspect & Crop (V3, placeholder - not yet implemented)
	 */
	get deviceLayerAspectCropV3() {
		type DeviceLayerAspectCropV3 = {
			screen: string, preset: string, layersel: string,
			aspectOverride: string,
			cropTopPx: string, cropTopPct: number, cropBottomPx: string, cropBottomPct: number,
			cropLeftPx: string, cropLeftPct: number, cropRightPx: string, cropRightPct: number,
			unlockIfLocked: boolean, relockAfterChange: boolean,
		}

		// PE_ASPECTOUT, confirmed live (2026-08-27) both via WebRCS's own bundle and by recording the app while
		// clicking through the options against a real Aquilon (192.168.20.112)
		const aspectOverrideChoices = [
			{ id: 'NONE', label: 'None (use input aspect ratio)' },
			{ id: '1_1', label: '1:1 (no zoom, black bands or cropped)' },
			{ id: 'CENTERED', label: 'Centered (black bands added)' },
			{ id: 'FULLSCREEN', label: 'Fullscreen (distorted)' },
			{ id: 'CROPPED', label: 'Cropped (no black bands)' },
		]

		const resolveLayers = (opt: {screen: string, layersel: string}): {screenAuxKey: string, layerKey: string}[] => {
			const targetScreens = opt.screen === 'first'
				? this.choices.getSelectedScreens().slice(0, 1)
				: opt.screen === 'sel'
					? this.choices.getSelectedScreens()
					// still supports a concatenated multi-selection like "S1A1" via expression, same convention as elsewhere in the module
					: this.choices.getChosenScreenAuxes(opt.screen)
			if (opt.layersel === 'sel') return this.choices.getSelectedLayers().filter(layer => targetScreens.includes(layer.screenAuxKey))
			if (opt.layersel === 'first') return this.choices.getSelectedLayers().filter(layer => targetScreens.includes(layer.screenAuxKey)).slice(0, 1)
			return targetScreens.map(screenAuxKey => ({screenAuxKey, layerKey: opt.layersel}))
		}

		const deviceLayerAspectCropV3: AWJaction<DeviceLayerAspectCropV3> = {
			name: 'Layer Properties - Aspect & Crop',
			sortName: '04 Layer Properties - 06 Aspect & Crop',
			description: 'Only covers "Classic" cropping - the separate "mask" crop values found in the protocol are likely the same thing backing "Layer Properties - Mask" instead. Crop values are entered in pixels of the source\'s native resolution (confirmed live: the device stores cropping as a 16-bit fraction, 0-65536, of the source width/height - not the layer\'s current on-screen size), so a field has no effect if the source\'s resolution isn\'t known (e.g. Color, Timer, no signal detected).',
			options: [
				{
					id: 'screen',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screen / Aux',
					choices: [{ id: 'first', label: 'First/Only Selected Screen' }, { id: 'sel', label: 'All Selected Screens' }, ...this.choices.getScreenAuxChoices()],
					default: 'first',
				},
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset (Program/Preview)',
					choices: [{ id: 'sel', label: 'Selected Preset' }, ...this.choices.choicesPreset],
				allowInvalidValues: true,
					default: 'prw',
				},
				{
					id: 'layersel',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Layer',
					choices: [{ id: 'first', label: 'First/Only Selected Layer' }, { id: 'sel', label: 'All Selected Layers' }, ...Array.from({length: this.choices.getMaxConfiguredLayerCount()}, (_i, e: number) => ({id: (e + 1).toString(), label: `Layer ${e + 1}`}))],
					default: 'first',
				},
				{ id: 'targetHeader', type: 'static-text', label: '', value: '---', disableAutoExpression: true },
				{
					id: 'aspectOverride',
					type: 'dropdown',
					label: 'Aspect Override',
					choices: [{ id: 'keep', label: "Don't change" }, ...aspectOverrideChoices],
					default: 'keep',
				},
				{ id: 'cropHeader', type: 'static-text', label: '', value: '---\n**Crop** (pixels take priority over % when both are set - see tooltips)', disableAutoExpression: true },
				{
					id: 'cropTopPx',
					type: 'textinput',
					label: 'Top (pixels)',
					tooltip: 'Leave empty to not change this value. Pixels of the source\'s native resolution, confirmed live: e.g. 100px on a 1920x1080 source is sent as round(100/1080*65536)=6068. A value beyond the source\'s own height is clamped to 100% (fully cropped) rather than sent raw. Takes priority over the "%" field if both are set. Falls back to the "%" field if the source\'s resolution is unknown.',
					default: '',
					useVariables: true,
				},
				{ id: 'cropPctNote', type: 'static-text', label: '', value: 'Please select "-1" for "Don\'t change".', disableAutoExpression: true },
				{
					id: 'cropTopPct',
					type: 'number',
					label: 'Top (%)',
					tooltip: 'Used only when the pixel field above is empty (or the source\'s resolution is unknown). Works regardless of the source\'s resolution. Defaults to -1, meaning "don\'t change" - drag away from the left end to set a real 0-100% value, including exactly 0%.',
					min: -1,
					max: 100,
					step: 0.01,
					range: true,
					default: -1,
				},
				{
					id: 'cropBottomPx',
					type: 'textinput',
					label: 'Bottom (pixels)',
					tooltip: 'Leave empty to not change this value. Pixels of the source\'s native resolution, confirmed live: e.g. 100px on a 1920x1080 source is sent as round(100/1080*65536)=6068. A value beyond the source\'s own height is clamped to 100% (fully cropped) rather than sent raw. Takes priority over the "%" field if both are set. Falls back to the "%" field if the source\'s resolution is unknown.',
					default: '',
					useVariables: true,
				},
				{
					id: 'cropBottomPct',
					type: 'number',
					label: 'Bottom (%)',
					tooltip: 'Used only when the pixel field above is empty (or the source\'s resolution is unknown). Works regardless of the source\'s resolution. Defaults to -1, meaning "don\'t change" - drag away from the left end to set a real 0-100% value, including exactly 0%.',
					min: -1,
					max: 100,
					step: 0.01,
					range: true,
					default: -1,
				},
				{
					id: 'cropLeftPx',
					type: 'textinput',
					label: 'Left (pixels)',
					tooltip: 'Leave empty to not change this value. Pixels of the source\'s native resolution, confirmed live: e.g. 100px on a 1920x1080 source is sent as round(100/1920*65536)=3413. A value beyond the source\'s own width is clamped to 100% (fully cropped) rather than sent raw. Takes priority over the "%" field if both are set. Falls back to the "%" field if the source\'s resolution is unknown.',
					default: '',
					useVariables: true,
				},
				{
					id: 'cropLeftPct',
					type: 'number',
					label: 'Left (%)',
					tooltip: 'Used only when the pixel field above is empty (or the source\'s resolution is unknown). Works regardless of the source\'s resolution. Defaults to -1, meaning "don\'t change" - drag away from the left end to set a real 0-100% value, including exactly 0%.',
					min: -1,
					max: 100,
					step: 0.01,
					range: true,
					default: -1,
				},
				{
					id: 'cropRightPx',
					type: 'textinput',
					label: 'Right (pixels)',
					tooltip: 'Leave empty to not change this value. Pixels of the source\'s native resolution, confirmed live: e.g. 100px on a 1920x1080 source is sent as round(100/1920*65536)=3413. A value beyond the source\'s own width is clamped to 100% (fully cropped) rather than sent raw. Takes priority over the "%" field if both are set. Falls back to the "%" field if the source\'s resolution is unknown.',
					default: '',
					useVariables: true,
				},
				{
					id: 'cropRightPct',
					type: 'number',
					label: 'Right (%)',
					tooltip: 'Used only when the pixel field above is empty (or the source\'s resolution is unknown). Works regardless of the source\'s resolution. Defaults to -1, meaning "don\'t change" - drag away from the left end to set a real 0-100% value, including exactly 0%.',
					min: -1,
					max: 100,
					step: 0.01,
					range: true,
					default: -1,
				},
				{ id: 'additionalOptionsHeader', type: 'static-text', label: '', value: '---\n**Additional Options**', disableAutoExpression: true },
				{
					// module-only convenience, not present in WebRCS - added to every "Layer Properties" action since
					// users often don't notice a screen is locked, and a locked target silently doing nothing is confusing
					id: 'unlockIfLocked',
					type: 'checkbox',
					label: 'Unlock Screen if locked?',
					tooltip: 'Unlocks all affected screens before execution if they are locked.',
					default: false,
				},
				{
					id: 'relockAfterChange',
					type: 'checkbox',
					label: 'Relock after change',
					tooltip: 'Locks all affected screens after execution if they were previously locked.',
					default: false,
					isVisibleExpression: '$(options:unlockIfLocked) == true',
				},
			],
			// "Get current values" (Companion's standard blue "Learn" button, same mechanism Dorian already used
			// for the custom command actions) - reads the first resolved layer's current crop and fills every
			// field with it, pinning screen/preset/layer to the concrete values it read from.
			learn: (action) => {
				const layers = resolveLayers(action.options).filter(layer => layer.layerKey.match(/^\d+$/))
				if (layers.length === 0) return undefined

				const preset = this.choices.getPresetSelection()
				const screenInfo = this.choices.getScreenInfo(layers[0].screenAuxKey)
				const path = [
					...(screenInfo.isAux ? this.constants.auxPath : this.constants.screenPath),
					'items', screenInfo.platformId,
					'presetList', 'items', this.choices.getPreset(screenInfo.id, preset),
					...this.choices.getLayerPath(layers[0].layerKey),
				]

				const newoptions: Partial<DeviceLayerAspectCropV3> = {
					screen: screenInfo.id,
					layersel: layers[0].layerKey,
					preset,
					aspectOverride: this.state.get(['DEVICE', ...path, 'cropping', 'classic', 'pp', 'aspectOverride']) ?? 'keep',
				}

				const source = this.choices.getLayerSourceInfo(path)
				const cropReadFields: [keyof DeviceLayerAspectCropV3, keyof DeviceLayerAspectCropV3, string, 'h' | 'v'][] = [
					['cropTopPx', 'cropTopPct', 'top', 'v'], ['cropBottomPx', 'cropBottomPct', 'bottom', 'v'],
					['cropLeftPx', 'cropLeftPct', 'left', 'h'], ['cropRightPx', 'cropRightPct', 'right', 'h'],
				]
				for (const [pxId, pctId, prop, axis] of cropReadFields) {
					const raw = this.state.get(['DEVICE', ...path, 'cropping', 'classic', 'pp', prop])
					if (typeof raw !== 'number') continue
					const dimension = axis === 'v' ? source.height : source.width
					;(newoptions[pxId] as string) = dimension !== '' ? Math.round(raw / 65536 * dimension).toString() : ''
					;(newoptions[pctId] as number) = Math.round(raw / 65536 * 10000) / 100
				}

				return newoptions
			},
			callback: (action) => {
				const preset = action.options.preset === 'sel' ? this.choices.getPresetSelection('sel') : action.options.preset
				const unlockedScreens = new Set<string>()
				const layers = resolveLayers(action.options)
					.filter(layer => layer.layerKey.match(/^\d+$/)) // aspect/crop only applies to numbered content layers, not background
					.filter(layer => {
						if (this.choices.isLocked(layer.screenAuxKey, preset)) {
							if (!parseBoolean(action.options.unlockIfLocked)) return false
							if (!unlockedScreens.has(layer.screenAuxKey)) {
								this.choices.setScreenLock(layer.screenAuxKey, preset, false)
								unlockedScreens.add(layer.screenAuxKey)
							}
						}
						return true
					})

				// 'v' fields (top/bottom) normalize against the source's height, 'h' fields (left/right) against
				// its width - confirmed live, cropping is stored as a 16-bit fraction (0-65536) of the source's
				// own native resolution, not the layer's current on-screen position/size. The pixel field takes
				// priority (needs the source's resolution to convert); the % field is the fallback (works even
				// when the source's resolution is unknown) and is skipped at its -1 default (its own "don't
				// change" sentinel, chosen so the full 0-100 range, including exactly 0%, stays usable).
				const cropFields: [keyof DeviceLayerAspectCropV3, keyof DeviceLayerAspectCropV3, string, 'h' | 'v'][] = [
					['cropTopPx', 'cropTopPct', 'top', 'v'], ['cropBottomPx', 'cropBottomPct', 'bottom', 'v'],
					['cropLeftPx', 'cropLeftPct', 'left', 'h'], ['cropRightPx', 'cropRightPct', 'right', 'h'],
				]

				for (const layer of layers) {
					const screenInfo = this.choices.getScreenInfo(layer.screenAuxKey)
					const path = [
						...(screenInfo.isAux ? this.constants.auxPath : this.constants.screenPath),
						'items', screenInfo.platformId,
						'presetList', 'items', this.choices.getPreset(layer.screenAuxKey, preset),
						...this.choices.getLayerPath(layer.layerKey),
					]
					if (action.options.aspectOverride !== 'keep') this.connection.sendWSmessage([...path, 'cropping', 'classic', 'pp', 'aspectOverride'], action.options.aspectOverride)

					let source: {width: number | '', height: number | ''} | undefined
					for (const [pxId, pctId, prop, axis] of cropFields) {
						const rawPx = action.options[pxId]
						let fraction: number | undefined
						if (rawPx !== '' && !isNaN(Number(rawPx))) {
							source ??= this.choices.getLayerSourceInfo(path)
							const dimension = axis === 'v' ? source.height : source.width
							// clamp to 0-100% of the source's dimension - a pixel value beyond the source's own size
							// (e.g. 1200 on a 1080px-tall source) has no meaningful crop value, so cap it at "fully
							// cropped" (100%) instead of sending a nonsensical raw value, making the mistake visible
							// live (the layer goes fully cropped) rather than silently doing something undefined.
							if (dimension !== '') fraction = Math.min(1, Math.max(0, Number(rawPx) / dimension))
						}
						if (fraction === undefined) {
							const pct = Number(action.options[pctId])
							if (pct >= 0) fraction = pct / 100 // -1 (the field's default) is the "don't change" sentinel, so 0% stays usable as a real value
						}
						if (fraction !== undefined) {
							this.connection.sendWSmessage([...path, 'cropping', 'classic', 'pp', prop], Math.round(fraction * 65536))
						}
					}
				}

				if (parseBoolean(action.options.relockAfterChange)) {
					for (const screenAuxKey of unlockedScreens) {
						this.choices.setScreenLock(screenAuxKey, preset, true)
					}
				}
				this.instance.sendXupdate()
			},
		}

		return deviceLayerAspectCropV3
	}

	/**
	 * MARK: Layer Properties - Mask (V3, placeholder - not yet implemented)
	 */
	get deviceLayerMaskV3() {
		type DeviceLayerMaskV3 = {
			screen: string, preset: string, layersel: string,
			maskTopPx: string, maskTopPct: number, maskBottomPx: string, maskBottomPct: number,
			maskLeftPx: string, maskLeftPct: number, maskRightPx: string, maskRightPct: number,
			unlockIfLocked: boolean, relockAfterChange: boolean,
		}

		const resolveLayers = (opt: {screen: string, layersel: string}): {screenAuxKey: string, layerKey: string}[] => {
			const targetScreens = opt.screen === 'first'
				? this.choices.getSelectedScreens().slice(0, 1)
				: opt.screen === 'sel'
					? this.choices.getSelectedScreens()
					: this.choices.getChosenScreenAuxes(opt.screen)
			if (opt.layersel === 'sel') return this.choices.getSelectedLayers().filter(layer => targetScreens.includes(layer.screenAuxKey))
			if (opt.layersel === 'first') return this.choices.getSelectedLayers().filter(layer => targetScreens.includes(layer.screenAuxKey)).slice(0, 1)
			return targetScreens.map(screenAuxKey => ({screenAuxKey, layerKey: opt.layersel}))
		}

		const pxTooltip = (dim: 'height' | 'width') =>
			`Leave empty to not change this value. Pixels of the layer's own current on-screen ${dim} (position.pp.size${dim === 'height' ? 'V' : 'H'}) - confirmed live: unlike "Aspect & Crop" (which normalizes against the source's native resolution), Mask normalizes against the layer's current, possibly-resized ${dim} instead. A value beyond the layer's own ${dim} is clamped to 100% (fully masked) rather than sent raw. Takes priority over the "%" field if both are set.`
		const pctTooltip = 'Used only when the pixel field above is empty. Defaults to -1, meaning "don\'t change" - drag away from the left end to set a real 0-100% value, including exactly 0%.'

		const deviceLayerMaskV3: AWJaction<DeviceLayerMaskV3> = {
			name: 'Layer Properties - Mask',
			sortName: '04 Layer Properties - 07 Mask',
			description: 'Masks (hides) part of the layer without changing its position or size - the separate "Aspect & Crop" action\'s crop instead removes part of the image and rescales the rest to fill the box. Same pixel/percent input pattern as Aspect & Crop, but pixel values here are relative to the layer\'s own current on-screen size, not the source\'s native resolution (confirmed live).',
			options: [
				{
					id: 'screen',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screen / Aux',
					choices: [{ id: 'first', label: 'First/Only Selected Screen' }, { id: 'sel', label: 'All Selected Screens' }, ...this.choices.getScreenAuxChoices()],
					default: 'first',
				},
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset (Program/Preview)',
					choices: [{ id: 'sel', label: 'Selected Preset' }, ...this.choices.choicesPreset],
				allowInvalidValues: true,
					default: 'prw',
				},
				{
					id: 'layersel',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Layer',
					choices: [{ id: 'first', label: 'First/Only Selected Layer' }, { id: 'sel', label: 'All Selected Layers' }, ...Array.from({length: this.choices.getMaxConfiguredLayerCount()}, (_i, e: number) => ({id: (e + 1).toString(), label: `Layer ${e + 1}`}))],
					default: 'first',
				},
				{ id: 'targetHeader', type: 'static-text', label: '', value: '---', disableAutoExpression: true },
				{
					id: 'maskTopPx',
					type: 'textinput',
					label: 'Top (pixels)',
					tooltip: pxTooltip('height'),
					default: '',
					useVariables: true,
				},
				{ id: 'maskPctNote', type: 'static-text', label: '', value: 'Please select "-1" for "Don\'t change".', disableAutoExpression: true },
				{
					id: 'maskTopPct',
					type: 'number',
					label: 'Top (%)',
					tooltip: pctTooltip,
					min: -1,
					max: 100,
					step: 0.01,
					range: true,
					default: -1,
				},
				{
					id: 'maskBottomPx',
					type: 'textinput',
					label: 'Bottom (pixels)',
					tooltip: pxTooltip('height'),
					default: '',
					useVariables: true,
				},
				{
					id: 'maskBottomPct',
					type: 'number',
					label: 'Bottom (%)',
					tooltip: pctTooltip,
					min: -1,
					max: 100,
					step: 0.01,
					range: true,
					default: -1,
				},
				{
					id: 'maskLeftPx',
					type: 'textinput',
					label: 'Left (pixels)',
					tooltip: pxTooltip('width'),
					default: '',
					useVariables: true,
				},
				{
					id: 'maskLeftPct',
					type: 'number',
					label: 'Left (%)',
					tooltip: pctTooltip,
					min: -1,
					max: 100,
					step: 0.01,
					range: true,
					default: -1,
				},
				{
					id: 'maskRightPx',
					type: 'textinput',
					label: 'Right (pixels)',
					tooltip: pxTooltip('width'),
					default: '',
					useVariables: true,
				},
				{
					id: 'maskRightPct',
					type: 'number',
					label: 'Right (%)',
					tooltip: pctTooltip,
					min: -1,
					max: 100,
					step: 0.01,
					range: true,
					default: -1,
				},
				{ id: 'additionalOptionsHeader', type: 'static-text', label: '', value: '---\n**Additional Options**', disableAutoExpression: true },
				{
					id: 'unlockIfLocked',
					type: 'checkbox',
					label: 'Unlock Screen if locked?',
					tooltip: 'Unlocks all affected screens before execution if they are locked.',
					default: false,
				},
				{
					id: 'relockAfterChange',
					type: 'checkbox',
					label: 'Relock after change',
					tooltip: 'Locks all affected screens after execution if they were previously locked.',
					default: false,
					isVisibleExpression: '$(options:unlockIfLocked) == true',
				},
			],
			// "Get current values" (Companion's standard blue "Learn" button) - reads the first resolved layer's
			// current mask and fills every field with it, pinning screen/preset/layer to the concrete values it
			// read from. Converts against the layer's current on-screen size, same as the callback does.
			learn: (action) => {
				const layers = resolveLayers(action.options).filter(layer => layer.layerKey.match(/^\d+$/))
				if (layers.length === 0) return undefined

				const preset = this.choices.getPresetSelection()
				const screenInfo = this.choices.getScreenInfo(layers[0].screenAuxKey)
				const path = [
					...(screenInfo.isAux ? this.constants.auxPath : this.constants.screenPath),
					'items', screenInfo.platformId,
					'presetList', 'items', this.choices.getPreset(screenInfo.id, preset),
					...this.choices.getLayerPath(layers[0].layerKey),
				]

				const newoptions: Partial<DeviceLayerMaskV3> = {
					screen: screenInfo.id,
					layersel: layers[0].layerKey,
					preset,
				}

				const sizeH: number = this.state.get(['DEVICE', ...path, ...this.constants.propsSizePath, 'sizeH']) ?? 1920
				const sizeV: number = this.state.get(['DEVICE', ...path, ...this.constants.propsSizePath, 'sizeV']) ?? 1080
				const maskReadFields: [keyof DeviceLayerMaskV3, keyof DeviceLayerMaskV3, string, 'h' | 'v'][] = [
					['maskTopPx', 'maskTopPct', 'top', 'v'], ['maskBottomPx', 'maskBottomPct', 'bottom', 'v'],
					['maskLeftPx', 'maskLeftPct', 'left', 'h'], ['maskRightPx', 'maskRightPct', 'right', 'h'],
				]
				for (const [pxId, pctId, prop, axis] of maskReadFields) {
					const raw = this.state.get(['DEVICE', ...path, 'cropping', 'mask', 'pp', prop])
					if (typeof raw !== 'number') continue
					const dimension = axis === 'v' ? sizeV : sizeH
					;(newoptions[pxId] as string) = Math.round(raw / 65536 * dimension).toString()
					;(newoptions[pctId] as number) = Math.round(raw / 65536 * 10000) / 100
				}

				return newoptions
			},
			callback: (action) => {
				const preset = action.options.preset === 'sel' ? this.choices.getPresetSelection('sel') : action.options.preset
				const unlockedScreens = new Set<string>()
				const layers = resolveLayers(action.options)
					.filter(layer => layer.layerKey.match(/^\d+$/)) // mask only applies to numbered content layers, not background
					.filter(layer => {
						if (this.choices.isLocked(layer.screenAuxKey, preset)) {
							if (!parseBoolean(action.options.unlockIfLocked)) return false
							if (!unlockedScreens.has(layer.screenAuxKey)) {
								this.choices.setScreenLock(layer.screenAuxKey, preset, false)
								unlockedScreens.add(layer.screenAuxKey)
							}
						}
						return true
					})

				const maskFields: [keyof DeviceLayerMaskV3, keyof DeviceLayerMaskV3, string, 'h' | 'v'][] = [
					['maskTopPx', 'maskTopPct', 'top', 'v'], ['maskBottomPx', 'maskBottomPct', 'bottom', 'v'],
					['maskLeftPx', 'maskLeftPct', 'left', 'h'], ['maskRightPx', 'maskRightPct', 'right', 'h'],
				]

				for (const layer of layers) {
					const screenInfo = this.choices.getScreenInfo(layer.screenAuxKey)
					const path = [
						...(screenInfo.isAux ? this.constants.auxPath : this.constants.screenPath),
						'items', screenInfo.platformId,
						'presetList', 'items', this.choices.getPreset(layer.screenAuxKey, preset),
						...this.choices.getLayerPath(layer.layerKey),
					]

					// unlike Aspect & Crop (normalized against the source's native resolution), Mask is confirmed
					// live to normalize against the layer's own current on-screen size instead - defaults mirror
					// "Reset Layer Size or Ratio"'s fallback for a layer whose size isn't known yet.
					let sizeH: number | undefined
					let sizeV: number | undefined
					for (const [pxId, pctId, prop, axis] of maskFields) {
						const rawPx = action.options[pxId]
						let fraction: number | undefined
						if (rawPx !== '' && !isNaN(Number(rawPx))) {
							if (sizeH === undefined) {
								sizeH = this.state.get(['DEVICE', ...path, ...this.constants.propsSizePath, 'sizeH']) ?? 1920
								sizeV = this.state.get(['DEVICE', ...path, ...this.constants.propsSizePath, 'sizeV']) ?? 1080
							}
							const dimension = axis === 'v' ? sizeV! : sizeH!
							fraction = Math.min(1, Math.max(0, Number(rawPx) / dimension))
						}
						if (fraction === undefined) {
							const pct = Number(action.options[pctId])
							if (pct >= 0) fraction = pct / 100
						}
						if (fraction !== undefined) {
							this.connection.sendWSmessage([...path, 'cropping', 'mask', 'pp', prop], Math.round(fraction * 65536))
						}
					}
				}

				if (parseBoolean(action.options.relockAfterChange)) {
					for (const screenAuxKey of unlockedScreens) {
						this.choices.setScreenLock(screenAuxKey, preset, true)
					}
				}
				this.instance.sendXupdate()
			},
		}

		return deviceLayerMaskV3
	}

	/**
	 * MARK: Layer Properties - Border
	 */
	get deviceLayerBorderV3() {
		type DeviceLayerBorderV3 = {
			screen: string, preset: string, layersel: string,
			edgeEnable: string, edgeSmoothEnable: string,
			edgeSizeH: number, edgeSizeV: number, edgeRound: string, edgeRadius: number, edgeOpacity: number,
			edgeChangeColor: boolean, edgeColor: number,
			shadowEnable: string,
			shadowOffsetX: number, shadowOffsetY: number, shadowSmooth: string, shadowRound: string, shadowRadius: number, shadowOpacity: number,
			shadowChangeColor: boolean, shadowColor: number,
			unlockIfLocked: boolean, relockAfterChange: boolean,
		}

		// ENUM_PE_BORDER_FLAGS, confirmed live (2026-08-27) via WebRCS's own bundle: items EDGE/SMOOTH/ROUNDED,
		// shared by both the Edge and Shadow sub-objects (device/.../border/{edge|shadow}/pp/style, each its own
		// flags array). radius/sizeH/sizeV/opacity bounds (0-255) also confirmed from the bundle's attribute
		// definitions. WebRCS's own Border panel has three master switches at the top - Edge, Smooth, Shadow -
		// confirmed live one at a time against the real device: "Edge" adds/removes EDGE in edge.pp.style,
		// "Smooth" adds/removes SMOOTH in edge.pp.style, and "Shadow" adds/removes EDGE in shadow.pp.style (the
		// same EDGE flag is reused as the shadow's own on/off, confirmed live: turning WebRCS's "Shadow" switch on
		// produced shadow.pp.style=["EDGE"]) - all three independent/orthogonal, confirmed by toggling one at a
		// time and reading the resulting arrays. Below those, each sub-panel has its own further "Round" checkbox
		// (ROUNDED flag) and - Shadow only - its own separate "Smooth" checkbox (SMOOTH flag on shadow.pp.style,
		// distinct from the top-level Edge-only "Smooth" switch). WebRCS labels Shadow's sizeH/sizeV as "Offset
		// X/Y" instead of "Horizontal/Vertical Size" (same underlying properties as Edge's, just a different
		// on-screen label for the same concept applied to a shadow instead of a border edge).
		const resolveLayers = (opt: {screen: string, layersel: string}): {screenAuxKey: string, layerKey: string}[] => {
			const targetScreens = opt.screen === 'first'
				? this.choices.getSelectedScreens().slice(0, 1)
				: opt.screen === 'sel'
					? this.choices.getSelectedScreens()
					: this.choices.getChosenScreenAuxes(opt.screen)
			if (opt.layersel === 'sel') return this.choices.getSelectedLayers().filter(layer => targetScreens.includes(layer.screenAuxKey))
			if (opt.layersel === 'first') return this.choices.getSelectedLayers().filter(layer => targetScreens.includes(layer.screenAuxKey)).slice(0, 1)
			return targetScreens.map(screenAuxKey => ({screenAuxKey, layerKey: opt.layersel}))
		}

		const clamp255 = (n: number) => Math.round(Math.min(255, Math.max(0, n)))

		const deviceLayerBorderV3: AWJaction<DeviceLayerBorderV3> = {
			name: 'Layer Properties - Border',
			sortName: '04 Layer Properties - 08 Border',
			description: 'Covers both of WebRCS\'s Border sub-panels - "Edge" (the border itself) and "Shadow" (a drop shadow). All numeric fields are raw 0-255 device values, confirmed live, with -1 meaning "don\'t change".',
			options: [
				{
					id: 'screen',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screen / Aux',
					choices: [{ id: 'first', label: 'First/Only Selected Screen' }, { id: 'sel', label: 'All Selected Screens' }, ...this.choices.getScreenAuxChoices()],
					default: 'first',
				},
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset (Program/Preview)',
					choices: [{ id: 'sel', label: 'Selected Preset' }, ...this.choices.choicesPreset],
				allowInvalidValues: true,
					default: 'prw',
				},
				{
					id: 'layersel',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Layer',
					choices: [{ id: 'first', label: 'First/Only Selected Layer' }, { id: 'sel', label: 'All Selected Layers' }, ...Array.from({length: this.choices.getMaxConfiguredLayerCount()}, (_i, e: number) => ({id: (e + 1).toString(), label: `Layer ${e + 1}`}))],
					default: 'first',
				},
				{ id: 'targetHeader', type: 'static-text', label: '', value: '---', disableAutoExpression: true },
				{
					id: 'edgeEnable',
					type: 'dropdown',
					label: 'Edge',
					tooltip: 'Master on/off for the border edge itself (confirmed live: adds/removes the "EDGE" flag). The fields in the "Edge/Smooth" section below only have a visible effect while this is on.',
					choices: [{ id: 'keep', label: "Don't change" }, { id: 'off', label: 'Off' }, { id: 'on', label: 'On' }],
					default: 'keep',
				},
				{
					id: 'edgeSmoothEnable',
					type: 'dropdown',
					label: 'Smooth',
					tooltip: 'Confirmed live: adds/removes the "SMOOTH" flag on the edge (independent of Shadow\'s own separate Smooth checkbox further down).',
					choices: [{ id: 'keep', label: "Don't change" }, { id: 'off', label: 'Off' }, { id: 'on', label: 'On' }],
					default: 'keep',
				},
				{
					id: 'shadowEnable',
					type: 'dropdown',
					label: 'Shadow',
					tooltip: 'Master on/off for the shadow itself. Confirmed live: reuses the same "EDGE" flag as the Edge switch above, but on the shadow\'s own separate style array - turning this on produced shadow.pp.style=["EDGE"] on a real device. The fields in the "Shadow" section below only have a visible effect while this is on.',
					choices: [{ id: 'keep', label: "Don't change" }, { id: 'off', label: 'Off' }, { id: 'on', label: 'On' }],
					default: 'keep',
				},
				{ id: 'edgeHeader', type: 'static-text', label: '', value: '---\n**Edge/Smooth**', disableAutoExpression: true },
				{
					id: 'edgeChangeColor',
					type: 'checkbox',
					label: 'Change Edge Color?',
					tooltip: 'The color field below is only applied if this is checked - otherwise the edge\'s current color is left alone.',
					default: false,
				},
				{
					id: 'edgeColor',
					type: 'colorpicker',
					label: 'Edge Color',
					enableAlpha: false,
					default: 0xffffff,
				},
				{ id: 'edgeOpacityNote', type: 'static-text', label: '', value: 'Please select "-1" for "Don\'t change".', disableAutoExpression: true },
				{
					id: 'edgeOpacity',
					type: 'number',
					label: 'Opacity',
					tooltip: 'Raw 0-255 device value (confirmed live). Defaults to -1, meaning "don\'t change" - drag away from the left end to set a real value.',
					min: -1,
					max: 255,
					step: 1,
					range: true,
					default: -1,
				},
				{
					id: 'edgeSizeH',
					type: 'number',
					label: 'Horizontal Size',
					tooltip: 'Raw 0-255 device value (confirmed live). Defaults to -1, meaning "don\'t change". If this is set and Vertical Size is left at -1, Vertical Size is derived to keep the edge\'s current aspect ratio, matching WebRCS\'s own "Keep Aspect Ratio" behavior.',
					min: -1,
					max: 255,
					step: 1,
					range: true,
					default: -1,
				},
				{
					id: 'edgeSizeV',
					type: 'number',
					label: 'Vertical Size',
					tooltip: 'Raw 0-255 device value (confirmed live). Defaults to -1, meaning "don\'t change". If this is set and Horizontal Size is left at -1, Horizontal Size is derived to keep the edge\'s current aspect ratio, matching WebRCS\'s own "Keep Aspect Ratio" behavior.',
					min: -1,
					max: 255,
					step: 1,
					range: true,
					default: -1,
				},
				{
					id: 'edgeRound',
					type: 'dropdown',
					label: 'Round',
					choices: [{ id: 'keep', label: "Don't change" }, { id: 'off', label: 'Off' }, { id: 'on', label: 'On' }],
					default: 'keep',
				},
				{
					id: 'edgeRadius',
					type: 'number',
					label: 'Radius',
					tooltip: 'Raw 0-255 device value (confirmed live). Defaults to -1, meaning "don\'t change". Only visibly affects the edge while Round is on.',
					min: -1,
					max: 255,
					step: 1,
					range: true,
					default: -1,
				},
				{ id: 'shadowHeader', type: 'static-text', label: '', value: '---\n**Shadow**', disableAutoExpression: true },
				{
					id: 'shadowChangeColor',
					type: 'checkbox',
					label: 'Change Shadow Color?',
					tooltip: 'The color field below is only applied if this is checked - otherwise the shadow\'s current color is left alone.',
					default: false,
				},
				{
					id: 'shadowColor',
					type: 'colorpicker',
					label: 'Shadow Color',
					enableAlpha: false,
					default: 0x000000,
				},
				{ id: 'shadowOpacityNote', type: 'static-text', label: '', value: 'Please select "-1" for "Don\'t change".', disableAutoExpression: true },
				{
					id: 'shadowOpacity',
					type: 'number',
					label: 'Opacity',
					tooltip: 'Raw 0-255 device value (confirmed live). Defaults to -1, meaning "don\'t change" - drag away from the left end to set a real value.',
					min: -1,
					max: 255,
					step: 1,
					range: true,
					default: -1,
				},
				{
					id: 'shadowSmooth',
					type: 'dropdown',
					label: 'Smooth',
					choices: [{ id: 'keep', label: "Don't change" }, { id: 'off', label: 'Off' }, { id: 'on', label: 'On' }],
					default: 'keep',
				},
				{
					id: 'shadowOffsetX',
					type: 'number',
					label: 'Offset X',
					tooltip: 'Raw 0-255 device value (confirmed live). Defaults to -1, meaning "don\'t change".',
					min: -1,
					max: 255,
					step: 1,
					range: true,
					default: -1,
				},
				{
					id: 'shadowOffsetY',
					type: 'number',
					label: 'Offset Y',
					tooltip: 'Raw 0-255 device value (confirmed live). Defaults to -1, meaning "don\'t change".',
					min: -1,
					max: 255,
					step: 1,
					range: true,
					default: -1,
				},
				{
					id: 'shadowRound',
					type: 'dropdown',
					label: 'Round',
					choices: [{ id: 'keep', label: "Don't change" }, { id: 'off', label: 'Off' }, { id: 'on', label: 'On' }],
					default: 'keep',
				},
				{
					id: 'shadowRadius',
					type: 'number',
					label: 'Radius',
					tooltip: 'Raw 0-255 device value (confirmed live). Defaults to -1, meaning "don\'t change". Only visibly affects the shadow while Round is on.',
					min: -1,
					max: 255,
					step: 1,
					range: true,
					default: -1,
				},
				{ id: 'additionalOptionsHeader', type: 'static-text', label: '', value: '---\n**Additional Options**', disableAutoExpression: true },
				{
					id: 'unlockIfLocked',
					type: 'checkbox',
					label: 'Unlock Screen if locked?',
					tooltip: 'Unlocks all affected screens before execution if they are locked.',
					default: false,
				},
				{
					id: 'relockAfterChange',
					type: 'checkbox',
					label: 'Relock after change',
					tooltip: 'Locks all affected screens after execution if they were previously locked.',
					default: false,
					isVisibleExpression: '$(options:unlockIfLocked) == true',
				},
			],
			// "Get current values" (Companion's standard blue "Learn" button) - reads the first resolved layer's
			// current border/shadow and pins screen/preset/layer to the concrete values it read from.
			learn: (action) => {
				const layers = resolveLayers(action.options).filter(layer => layer.layerKey.match(/^\d+$/))
				if (layers.length === 0) return undefined

				const preset = this.choices.getPresetSelection()
				const screenInfo = this.choices.getScreenInfo(layers[0].screenAuxKey)
				const path = [
					...(screenInfo.isAux ? this.constants.auxPath : this.constants.screenPath),
					'items', screenInfo.platformId,
					'presetList', 'items', this.choices.getPreset(screenInfo.id, preset),
					...this.choices.getLayerPath(layers[0].layerKey),
				]

				const newoptions: Partial<DeviceLayerBorderV3> = {
					screen: screenInfo.id,
					layersel: layers[0].layerKey,
					preset,
				}

				const edgeFlags: string[] = this.state.get(['DEVICE', ...path, 'border', 'edge', 'pp', 'style']) ?? []
				newoptions.edgeEnable = edgeFlags.includes('EDGE') ? 'on' : 'off'
				newoptions.edgeSmoothEnable = edgeFlags.includes('SMOOTH') ? 'on' : 'off'
				newoptions.edgeRound = edgeFlags.includes('ROUNDED') ? 'on' : 'off'
				const shadowFlags: string[] = this.state.get(['DEVICE', ...path, 'border', 'shadow', 'pp', 'style']) ?? []
				newoptions.shadowEnable = shadowFlags.includes('EDGE') ? 'on' : 'off'
				newoptions.shadowRound = shadowFlags.includes('ROUNDED') ? 'on' : 'off'
				newoptions.shadowSmooth = shadowFlags.includes('SMOOTH') ? 'on' : 'off'

				const numReadFields: [keyof DeviceLayerBorderV3, string[]][] = [
					['edgeSizeH', ['border', 'edge', 'pp', 'sizeH']], ['edgeSizeV', ['border', 'edge', 'pp', 'sizeV']],
					['edgeRadius', ['border', 'edge', 'pp', 'radius']], ['edgeOpacity', ['border', 'edge', 'pp', 'opacity']],
					['shadowOffsetX', ['border', 'shadow', 'pp', 'sizeH']], ['shadowOffsetY', ['border', 'shadow', 'pp', 'sizeV']],
					['shadowRadius', ['border', 'shadow', 'pp', 'radius']], ['shadowOpacity', ['border', 'shadow', 'pp', 'opacity']],
				]
				for (const [optId, prop] of numReadFields) {
					const raw = this.state.get(['DEVICE', ...path, ...prop])
					if (typeof raw === 'number') (newoptions[optId] as number) = raw
				}

				const readColor = (colorpath: string[]) => {
					const r = this.state.get(['DEVICE', ...colorpath, 'red']) ?? 0
					const g = this.state.get(['DEVICE', ...colorpath, 'green']) ?? 0
					const b = this.state.get(['DEVICE', ...colorpath, 'blue']) ?? 0
					return (r << 16) + (g << 8) + b
				}
				newoptions.edgeChangeColor = true
				newoptions.edgeColor = readColor([...path, 'border', 'edge', 'color', 'pp'])
				newoptions.shadowChangeColor = true
				newoptions.shadowColor = readColor([...path, 'border', 'shadow', 'color', 'pp'])

				return newoptions
			},
			callback: (action) => {
				const preset = action.options.preset === 'sel' ? this.choices.getPresetSelection('sel') : action.options.preset
				const unlockedScreens = new Set<string>()
				const layers = resolveLayers(action.options)
					.filter(layer => layer.layerKey.match(/^\d+$/)) // border only applies to numbered content layers, not background
					.filter(layer => {
						if (this.choices.isLocked(layer.screenAuxKey, preset)) {
							if (!parseBoolean(action.options.unlockIfLocked)) return false
							if (!unlockedScreens.has(layer.screenAuxKey)) {
								this.choices.setScreenLock(layer.screenAuxKey, preset, false)
								unlockedScreens.add(layer.screenAuxKey)
							}
						}
						return true
					})

				for (const layer of layers) {
					const screenInfo = this.choices.getScreenInfo(layer.screenAuxKey)
					const path = [
						...(screenInfo.isAux ? this.constants.auxPath : this.constants.screenPath),
						'items', screenInfo.platformId,
						'presetList', 'items', this.choices.getPreset(layer.screenAuxKey, preset),
						...this.choices.getLayerPath(layer.layerKey),
					]

					// Edge Horizontal/Vertical Size - if only one is given, derive the other to preserve the
					// edge's current aspect ratio, matching WebRCS's own "Keep Aspect Ratio" behavior.
					let newSizeH = Number(action.options.edgeSizeH) >= 0 ? Number(action.options.edgeSizeH) : undefined
					let newSizeV = Number(action.options.edgeSizeV) >= 0 ? Number(action.options.edgeSizeV) : undefined
					if (newSizeH !== undefined && newSizeV === undefined) {
						const curH = this.state.get(['DEVICE', ...path, 'border', 'edge', 'pp', 'sizeH']) ?? 0
						const curV = this.state.get(['DEVICE', ...path, 'border', 'edge', 'pp', 'sizeV']) ?? 0
						if (curH > 0) newSizeV = newSizeH * curV / curH
					} else if (newSizeV !== undefined && newSizeH === undefined) {
						const curH = this.state.get(['DEVICE', ...path, 'border', 'edge', 'pp', 'sizeH']) ?? 0
						const curV = this.state.get(['DEVICE', ...path, 'border', 'edge', 'pp', 'sizeV']) ?? 0
						if (curV > 0) newSizeH = newSizeV * curH / curV
					}
					if (newSizeH !== undefined) this.connection.sendWSmessage([...path, 'border', 'edge', 'pp', 'sizeH'], clamp255(newSizeH))
					if (newSizeV !== undefined) this.connection.sendWSmessage([...path, 'border', 'edge', 'pp', 'sizeV'], clamp255(newSizeV))

					// Each of Edge/Smooth/Shadow/Round only ever adds/removes its own single flag - every other
					// flag already on the layer's style array is preserved.
					if (action.options.edgeEnable !== 'keep' || action.options.edgeSmoothEnable !== 'keep' || action.options.edgeRound !== 'keep') {
						let flags: string[] = this.state.get(['DEVICE', ...path, 'border', 'edge', 'pp', 'style']) ?? []
						if (action.options.edgeEnable !== 'keep') {
							flags = flags.filter(f => f !== 'EDGE')
							if (action.options.edgeEnable === 'on') flags.push('EDGE')
						}
						if (action.options.edgeSmoothEnable !== 'keep') {
							flags = flags.filter(f => f !== 'SMOOTH')
							if (action.options.edgeSmoothEnable === 'on') flags.push('SMOOTH')
						}
						if (action.options.edgeRound !== 'keep') {
							flags = flags.filter(f => f !== 'ROUNDED')
							if (action.options.edgeRound === 'on') flags.push('ROUNDED')
						}
						this.connection.sendWSmessage([...path, 'border', 'edge', 'pp', 'style'], flags)
					}
					if (action.options.shadowEnable !== 'keep' || action.options.shadowRound !== 'keep' || action.options.shadowSmooth !== 'keep') {
						let flags: string[] = this.state.get(['DEVICE', ...path, 'border', 'shadow', 'pp', 'style']) ?? []
						if (action.options.shadowEnable !== 'keep') {
							flags = flags.filter(f => f !== 'EDGE')
							if (action.options.shadowEnable === 'on') flags.push('EDGE')
						}
						if (action.options.shadowRound !== 'keep') {
							flags = flags.filter(f => f !== 'ROUNDED')
							if (action.options.shadowRound === 'on') flags.push('ROUNDED')
						}
						if (action.options.shadowSmooth !== 'keep') {
							flags = flags.filter(f => f !== 'SMOOTH')
							if (action.options.shadowSmooth === 'on') flags.push('SMOOTH')
						}
						this.connection.sendWSmessage([...path, 'border', 'shadow', 'pp', 'style'], flags)
					}

					const numFields: [keyof DeviceLayerBorderV3, string[]][] = [
						['edgeRadius', ['border', 'edge', 'pp', 'radius']], ['edgeOpacity', ['border', 'edge', 'pp', 'opacity']],
						['shadowOffsetX', ['border', 'shadow', 'pp', 'sizeH']], ['shadowOffsetY', ['border', 'shadow', 'pp', 'sizeV']],
						['shadowRadius', ['border', 'shadow', 'pp', 'radius']], ['shadowOpacity', ['border', 'shadow', 'pp', 'opacity']],
					]
					for (const [optId, prop] of numFields) {
						const raw = Number(action.options[optId])
						if (raw >= 0) {
							this.connection.sendWSmessage([...path, ...prop], clamp255(raw))
						}
					}

					if (parseBoolean(action.options.edgeChangeColor)) {
						const color = Number(action.options.edgeColor)
						const colorpath = [...path, 'border', 'edge', 'color', 'pp']
						this.connection.sendWSmessage([...colorpath, 'red'], (color >> 16) & 0xff)
						this.connection.sendWSmessage([...colorpath, 'green'], (color >> 8) & 0xff)
						this.connection.sendWSmessage([...colorpath, 'blue'], color & 0xff)
					}
					if (parseBoolean(action.options.shadowChangeColor)) {
						const color = Number(action.options.shadowColor)
						const colorpath = [...path, 'border', 'shadow', 'color', 'pp']
						this.connection.sendWSmessage([...colorpath, 'red'], (color >> 16) & 0xff)
						this.connection.sendWSmessage([...colorpath, 'green'], (color >> 8) & 0xff)
						this.connection.sendWSmessage([...colorpath, 'blue'], color & 0xff)
					}
				}

				if (parseBoolean(action.options.relockAfterChange)) {
					for (const screenAuxKey of unlockedScreens) {
						this.choices.setScreenLock(screenAuxKey, preset, true)
					}
				}
				this.instance.sendXupdate()
			},
		}

		return deviceLayerBorderV3
	}

	/**
	 * MARK: Layer Properties - Effects
	 */
	get deviceLayerEffectsV3() {
		// PE_EFFECT_FLAGS (name inferred, not directly confirmed in the bundle's enum key), confirmed live
		// (2026-08-27) via WebRCS's own bundle: a single shared array at layerList/items/{n}/effects/pp/flags
		// with items FLIP_H/FLIP_V/BLACK_N_WHITE/NEGATIVE/SEPIA/SOLAR/POSTERIZE/STROBE - covers Filter, Transform
		// AND the Strobe enable all in one array. POSTERIZE exists in the enum but isn't exposed in the user's
		// WebRCS Filter panel (only Black&White/Negative/Sepia/Solar are), so it's deliberately left out here too.
		// Strobe's "Hold" is the only value actually stored on the layer itself
		// (layerList/items/{n}/effects/strobe/pp/frames, confirmed live bounds 2-255). WebRCS's "FPM" (Flashes
		// Per Minute) is NOT a separate device property - it's a client-side conversion of Hold using the
		// *screen's* current output rate (bundle: FPM = round(60*rate/frames), rate = masterRate/1000). Confirmed
		// live end to end: the screen currently feeding an output is at device/outputList/items/{n}/canvas/
		// status/pp/usedInScreenAux (e.g. "S1"), and that output's device/outputList/items/{n}/format/status/pp/
		// masterRate gives the rate as a label like "50HZ" - resolving that for the layer's own screen and
		// running the same math as WebRCS reproduces FPM exactly (confirmed against the user's own real device,
		// which runs at 50Hz: Hold 2 <-> FPM 1500, Hold 255 <-> FPM 12). If the screen's output/rate can't be
		// determined for some reason, FPM silently has no effect (Hold always works regardless).
		type DeviceLayerEffectsV3 = {
			screen: string, preset: string, layersel: string,
			filterBlackWhite: string, filterNegative: string, filterSepia: string, filterSolar: string,
			transformFlipH: string, transformFlipV: string,
			strobeEnable: string, strobeFpm: string, strobeHold: string,
			unlockIfLocked: boolean, relockAfterChange: boolean,
		}

		const resolveLayers = (opt: {screen: string, layersel: string}): {screenAuxKey: string, layerKey: string}[] => {
			const targetScreens = opt.screen === 'first'
				? this.choices.getSelectedScreens().slice(0, 1)
				: opt.screen === 'sel'
					? this.choices.getSelectedScreens()
					: this.choices.getChosenScreenAuxes(opt.screen)
			if (opt.layersel === 'sel') return this.choices.getSelectedLayers().filter(layer => targetScreens.includes(layer.screenAuxKey))
			if (opt.layersel === 'first') return this.choices.getSelectedLayers().filter(layer => targetScreens.includes(layer.screenAuxKey)).slice(0, 1)
			return targetScreens.map(screenAuxKey => ({screenAuxKey, layerKey: opt.layersel}))
		}

		// Finds whichever output currently feeds the given screen/aux and returns its master rate in Hz, or
		// undefined if no output claims that screen or the rate label doesn't parse (e.g. "50HZ" -> 50,
		// "29_97HZ" -> 29.97 - the enum uses an underscore in place of a decimal point for fractional rates).
		const getScreenMasterRateHz = (screenAuxKey: string): number | undefined => {
			const outputKeys: string[] = this.state.get('DEVICE/device/outputList/itemKeys') ?? []
			for (const outKey of outputKeys) {
				const usedIn = this.state.get(['DEVICE', 'device', 'outputList', 'items', outKey, 'canvas', 'status', 'pp', 'usedInScreenAux'])
				if (usedIn !== screenAuxKey) continue
				const rateLabel = this.state.get(['DEVICE', 'device', 'outputList', 'items', outKey, 'format', 'status', 'pp', 'masterRate'])
				const match = typeof rateLabel === 'string' ? rateLabel.match(/^(\d+)(?:_(\d+))?HZ$/i) : null
				if (match) return match[2] ? Number(`${match[1]}.${match[2]}`) : Number(match[1])
			}
			return undefined
		}
		const fpmToFrames = (fpm: number, rateHz: number) => Math.min(255, Math.max(2, fpm ? Math.round(60 * rateHz / fpm) : 0))

		const flagChoices = [{ id: 'keep', label: "Don't change" }, { id: 'off', label: 'Off' }, { id: 'on', label: 'On' }]
		// [optionId, AWJ flag name]
		const flagFields: [keyof DeviceLayerEffectsV3, string][] = [
			['filterBlackWhite', 'BLACK_N_WHITE'], ['filterNegative', 'NEGATIVE'], ['filterSepia', 'SEPIA'], ['filterSolar', 'SOLAR'],
			['transformFlipH', 'FLIP_H'], ['transformFlipV', 'FLIP_V'],
			['strobeEnable', 'STROBE'],
		]

		const deviceLayerEffectsV3: AWJaction<DeviceLayerEffectsV3> = {
			name: 'Layer Properties - Effects',
			sortName: '04 Layer Properties - 09 Effects',
			description: 'Covers WebRCS\'s Filter, Transform and Strobe sub-panels. Strobe\'s "Hold" is the real device value; "FPM" is WebRCS\'s own alternate unit for the exact same value, converted live using the layer\'s screen\'s current output rate (confirmed live) - takes priority if both are set, since Hold needs no extra lookup to apply.',
			options: [
				{
					id: 'screen',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screen / Aux',
					choices: [{ id: 'first', label: 'First/Only Selected Screen' }, { id: 'sel', label: 'All Selected Screens' }, ...this.choices.getScreenAuxChoices()],
					default: 'first',
				},
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset (Program/Preview)',
					choices: [{ id: 'sel', label: 'Selected Preset' }, ...this.choices.choicesPreset],
				allowInvalidValues: true,
					default: 'prw',
				},
				{
					id: 'layersel',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Layer',
					choices: [{ id: 'first', label: 'First/Only Selected Layer' }, { id: 'sel', label: 'All Selected Layers' }, ...Array.from({length: this.choices.getMaxConfiguredLayerCount()}, (_i, e: number) => ({id: (e + 1).toString(), label: `Layer ${e + 1}`}))],
					default: 'first',
				},
				{ id: 'filterHeader', type: 'static-text', label: '', value: '---\n**Filter**', disableAutoExpression: true },
				{ id: 'filterBlackWhite', type: 'dropdown', label: 'Black & White', choices: flagChoices, default: 'keep' },
				{ id: 'filterNegative', type: 'dropdown', label: 'Negative', choices: flagChoices, default: 'keep' },
				{ id: 'filterSepia', type: 'dropdown', label: 'Sepia', choices: flagChoices, default: 'keep' },
				{ id: 'filterSolar', type: 'dropdown', label: 'Solar', choices: flagChoices, default: 'keep' },
				{ id: 'transformHeader', type: 'static-text', label: '', value: '---\n**Transform**', disableAutoExpression: true },
				{ id: 'transformFlipH', type: 'dropdown', label: 'Flip Horizontal', choices: flagChoices, default: 'keep' },
				{ id: 'transformFlipV', type: 'dropdown', label: 'Flip Vertical', choices: flagChoices, default: 'keep' },
				{ id: 'strobeHeader', type: 'static-text', label: '', value: '---\n**Strobe**', disableAutoExpression: true },
				{ id: 'strobeEnable', type: 'dropdown', label: 'Enable', choices: flagChoices, default: 'keep' },
				{
					id: 'strobeFpm',
					type: 'textinput',
					label: 'FPM',
					tooltip: 'Leave empty to not change this value. Flashes Per Minute (confirmed live: FPM=round(60*rate/Hold), using the current output rate of the layer\'s own screen). Used only when Hold below is left empty, and has no effect if the screen\'s output rate can\'t be determined.',
					default: '',
					useVariables: true,
				},
				{
					id: 'strobeHold',
					type: 'textinput',
					label: 'Hold',
					tooltip: 'Leave empty to not change this value. Raw 2-255 device value (confirmed live) - number of frames the current image is held before the next flash. Takes priority over FPM above if both are set.',
					default: '',
					useVariables: true,
				},
				{ id: 'additionalOptionsHeader', type: 'static-text', label: '', value: '---\n**Additional Options**', disableAutoExpression: true },
				{
					// module-only convenience, not present in WebRCS - added to every "Layer Properties" action since
					// users often don't notice a screen is locked, and a locked target silently doing nothing is confusing
					id: 'unlockIfLocked',
					type: 'checkbox',
					label: 'Unlock Screen if locked?',
					tooltip: 'Unlocks all affected screens before execution if they are locked.',
					default: false,
				},
				{
					id: 'relockAfterChange',
					type: 'checkbox',
					label: 'Relock after change',
					tooltip: 'Locks all affected screens after execution if they were previously locked.',
					default: false,
					isVisibleExpression: '$(options:unlockIfLocked) == true',
				},
			],
			// "Get current values" (Companion's standard blue "Learn" button) - reads the first resolved layer's
			// current effects and pins screen/preset/layer to the concrete values it read from.
			learn: (action) => {
				const layers = resolveLayers(action.options).filter(layer => layer.layerKey.match(/^\d+$/))
				if (layers.length === 0) return undefined

				const preset = this.choices.getPresetSelection()
				const screenInfo = this.choices.getScreenInfo(layers[0].screenAuxKey)
				const path = [
					...(screenInfo.isAux ? this.constants.auxPath : this.constants.screenPath),
					'items', screenInfo.platformId,
					'presetList', 'items', this.choices.getPreset(screenInfo.id, preset),
					...this.choices.getLayerPath(layers[0].layerKey),
				]

				const newoptions: Partial<DeviceLayerEffectsV3> = {
					screen: screenInfo.id,
					layersel: layers[0].layerKey,
					preset,
				}

				const flags: string[] = this.state.get(['DEVICE', ...path, 'effects', 'pp', 'flags']) ?? []
				for (const [optId, flagName] of flagFields) {
					(newoptions[optId] as string) = flags.includes(flagName) ? 'on' : 'off'
				}
				// only Hold is ever learned - FPM has no value of its own in the device config to read back
				const hold = this.state.get(['DEVICE', ...path, 'effects', 'strobe', 'pp', 'frames'])
				if (typeof hold === 'number') newoptions.strobeHold = hold.toString()

				return newoptions
			},
			callback: (action) => {
				const preset = action.options.preset === 'sel' ? this.choices.getPresetSelection('sel') : action.options.preset
				const unlockedScreens = new Set<string>()
				const layers = resolveLayers(action.options)
					.filter(layer => layer.layerKey.match(/^\d+$/))
					.filter(layer => {
						if (this.choices.isLocked(layer.screenAuxKey, preset)) {
							if (!parseBoolean(action.options.unlockIfLocked)) return false
							if (!unlockedScreens.has(layer.screenAuxKey)) {
								this.choices.setScreenLock(layer.screenAuxKey, preset, false)
								unlockedScreens.add(layer.screenAuxKey)
							}
						}
						return true
					})

				for (const layer of layers) {
					const screenInfo = this.choices.getScreenInfo(layer.screenAuxKey)
					const path = [
						...(screenInfo.isAux ? this.constants.auxPath : this.constants.screenPath),
						'items', screenInfo.platformId,
						'presetList', 'items', this.choices.getPreset(layer.screenAuxKey, preset),
						...this.choices.getLayerPath(layer.layerKey),
					]

					if (flagFields.some(([optId]) => action.options[optId] !== 'keep')) {
						let flags: string[] = this.state.get(['DEVICE', ...path, 'effects', 'pp', 'flags']) ?? []
						for (const [optId, flagName] of flagFields) {
							const value = action.options[optId] as string
							if (value === 'keep') continue
							flags = flags.filter(f => f !== flagName)
							if (value === 'on') flags.push(flagName)
						}
						this.connection.sendWSmessage([...path, 'effects', 'pp', 'flags'], flags)
					}

					const hold = action.options.strobeHold
					const fpm = action.options.strobeFpm
					let frames: number | undefined
					if (hold !== '' && !isNaN(Number(hold))) {
						frames = Math.round(Math.min(255, Math.max(2, Number(hold))))
					} else if (fpm !== '' && !isNaN(Number(fpm))) {
						const rate = getScreenMasterRateHz(layer.screenAuxKey)
						if (rate !== undefined) frames = fpmToFrames(Number(fpm), rate)
					}
					if (frames !== undefined) {
						this.connection.sendWSmessage([...path, 'effects', 'strobe', 'pp', 'frames'], frames)
					}
				}

				if (parseBoolean(action.options.relockAfterChange)) {
					for (const screenAuxKey of unlockedScreens) {
						this.choices.setScreenLock(screenAuxKey, preset, true)
					}
				}
				this.instance.sendXupdate()
			},
		}

		return deviceLayerEffectsV3
	}

	/**
	 * MARK: Layer Properties - Speed
	 */
	get deviceLayerSpeedV3() {
		// layerList/items/{n}/speed/pp/{type,point1,point2}, confirmed live (2026-08-27): type is PE_TBAR_TYPE
		// (LINEAR_TRANSITION/SMOOTH_TRANSITION, same enum found while investigating Border), point1/point2 are
		// plain 0-255 integers (not position objects like flying's own point1/point2). WebRCS hides Pt1/Pt2 in
		// its UI while Linear is on (they only affect a smooth/curved speed ramp) - per the user, sending them
		// anyway while Linear is on is expected to be harmless/ignored by the device, same as Effects' mutually
		// exclusive filter flags, so no client-side hiding is done here either.
		type DeviceLayerSpeedV3 = {
			screen: string, preset: string, layersel: string,
			linear: string, point1: number, point2: number,
			unlockIfLocked: boolean, relockAfterChange: boolean,
		}

		const resolveLayers = (opt: {screen: string, layersel: string}): {screenAuxKey: string, layerKey: string}[] => {
			const targetScreens = opt.screen === 'first'
				? this.choices.getSelectedScreens().slice(0, 1)
				: opt.screen === 'sel'
					? this.choices.getSelectedScreens()
					: this.choices.getChosenScreenAuxes(opt.screen)
			if (opt.layersel === 'sel') return this.choices.getSelectedLayers().filter(layer => targetScreens.includes(layer.screenAuxKey))
			if (opt.layersel === 'first') return this.choices.getSelectedLayers().filter(layer => targetScreens.includes(layer.screenAuxKey)).slice(0, 1)
			return targetScreens.map(screenAuxKey => ({screenAuxKey, layerKey: opt.layersel}))
		}

		const deviceLayerSpeedV3: AWJaction<DeviceLayerSpeedV3> = {
			name: 'Layer Properties - Speed',
			sortName: '04 Layer Properties - 10 Speed',
			description: 'Confirmed live. Pt1/Pt2 only visibly affect the speed ramp while Linear is off, but can still be sent while Linear is on (matching WebRCS\'s own device behavior).',
			options: [
				{
					id: 'screen',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screen / Aux',
					choices: [{ id: 'first', label: 'First/Only Selected Screen' }, { id: 'sel', label: 'All Selected Screens' }, ...this.choices.getScreenAuxChoices()],
					default: 'first',
				},
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset (Program/Preview)',
					choices: [{ id: 'sel', label: 'Selected Preset' }, ...this.choices.choicesPreset],
				allowInvalidValues: true,
					default: 'prw',
				},
				{
					id: 'layersel',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Layer',
					choices: [{ id: 'first', label: 'First/Only Selected Layer' }, { id: 'sel', label: 'All Selected Layers' }, ...Array.from({length: this.choices.getMaxConfiguredLayerCount()}, (_i, e: number) => ({id: (e + 1).toString(), label: `Layer ${e + 1}`}))],
					default: 'first',
				},
				{ id: 'targetHeader', type: 'static-text', label: '', value: '---', disableAutoExpression: true },
				{
					id: 'linear',
					type: 'dropdown',
					label: 'Linear',
					choices: [{ id: 'keep', label: "Don't change" }, { id: 'off', label: 'Off' }, { id: 'on', label: 'On' }],
					default: 'keep',
				},
				{ id: 'accelerationHeader', type: 'static-text', label: '', value: '---\n**Acceleration**', disableAutoExpression: true },
				{ id: 'accelerationNote', type: 'static-text', label: '', value: 'Please select "-1" for "Don\'t change".', disableAutoExpression: true },
				{
					id: 'point1',
					type: 'number',
					label: 'Pt1',
					tooltip: 'Raw 0-255 device value (confirmed live). Defaults to -1, meaning "don\'t change" - drag away from the left end to set a real value. Only visibly affects the speed ramp while Linear is off.',
					min: -1,
					max: 255,
					step: 1,
					range: true,
					default: -1,
				},
				{
					id: 'point2',
					type: 'number',
					label: 'Pt2',
					tooltip: 'Raw 0-255 device value (confirmed live). Defaults to -1, meaning "don\'t change" - drag away from the left end to set a real value. Only visibly affects the speed ramp while Linear is off.',
					min: -1,
					max: 255,
					step: 1,
					range: true,
					default: -1,
				},
				{ id: 'additionalOptionsHeader', type: 'static-text', label: '', value: '---\n**Additional Options**', disableAutoExpression: true },
				{
					// module-only convenience, not present in WebRCS - added to every "Layer Properties" action since
					// users often don't notice a screen is locked, and a locked target silently doing nothing is confusing
					id: 'unlockIfLocked',
					type: 'checkbox',
					label: 'Unlock Screen if locked?',
					tooltip: 'Unlocks all affected screens before execution if they are locked.',
					default: false,
				},
				{
					id: 'relockAfterChange',
					type: 'checkbox',
					label: 'Relock after change',
					tooltip: 'Locks all affected screens after execution if they were previously locked.',
					default: false,
					isVisibleExpression: '$(options:unlockIfLocked) == true',
				},
			],
			// "Get current values" (Companion's standard blue "Learn" button) - reads the first resolved layer's
			// current speed settings and pins screen/preset/layer to the concrete values it read from.
			learn: (action) => {
				const layers = resolveLayers(action.options).filter(layer => layer.layerKey.match(/^\d+$/))
				if (layers.length === 0) return undefined

				const preset = this.choices.getPresetSelection()
				const screenInfo = this.choices.getScreenInfo(layers[0].screenAuxKey)
				const path = [
					...(screenInfo.isAux ? this.constants.auxPath : this.constants.screenPath),
					'items', screenInfo.platformId,
					'presetList', 'items', this.choices.getPreset(screenInfo.id, preset),
					...this.choices.getLayerPath(layers[0].layerKey),
				]

				const newoptions: Partial<DeviceLayerSpeedV3> = {
					screen: screenInfo.id,
					layersel: layers[0].layerKey,
					preset,
				}

				const type = this.state.get(['DEVICE', ...path, 'speed', 'pp', 'type'])
				if (typeof type === 'string') newoptions.linear = type === 'LINEAR_TRANSITION' ? 'on' : 'off'
				const point1 = this.state.get(['DEVICE', ...path, 'speed', 'pp', 'point1'])
				if (typeof point1 === 'number') newoptions.point1 = point1
				const point2 = this.state.get(['DEVICE', ...path, 'speed', 'pp', 'point2'])
				if (typeof point2 === 'number') newoptions.point2 = point2

				return newoptions
			},
			callback: (action) => {
				const preset = action.options.preset === 'sel' ? this.choices.getPresetSelection('sel') : action.options.preset
				const unlockedScreens = new Set<string>()
				const layers = resolveLayers(action.options)
					.filter(layer => layer.layerKey.match(/^\d+$/))
					.filter(layer => {
						if (this.choices.isLocked(layer.screenAuxKey, preset)) {
							if (!parseBoolean(action.options.unlockIfLocked)) return false
							if (!unlockedScreens.has(layer.screenAuxKey)) {
								this.choices.setScreenLock(layer.screenAuxKey, preset, false)
								unlockedScreens.add(layer.screenAuxKey)
							}
						}
						return true
					})

				for (const layer of layers) {
					const screenInfo = this.choices.getScreenInfo(layer.screenAuxKey)
					const path = [
						...(screenInfo.isAux ? this.constants.auxPath : this.constants.screenPath),
						'items', screenInfo.platformId,
						'presetList', 'items', this.choices.getPreset(layer.screenAuxKey, preset),
						...this.choices.getLayerPath(layer.layerKey),
					]

					if (action.options.linear !== 'keep') {
						this.connection.sendWSmessage([...path, 'speed', 'pp', 'type'], action.options.linear === 'on' ? 'LINEAR_TRANSITION' : 'SMOOTH_TRANSITION')
					}
					if (Number(action.options.point1) >= 0) {
						this.connection.sendWSmessage([...path, 'speed', 'pp', 'point1'], Math.round(Number(action.options.point1)))
					}
					if (Number(action.options.point2) >= 0) {
						this.connection.sendWSmessage([...path, 'speed', 'pp', 'point2'], Math.round(Number(action.options.point2)))
					}
				}

				if (parseBoolean(action.options.relockAfterChange)) {
					for (const screenAuxKey of unlockedScreens) {
						this.choices.setScreenLock(screenAuxKey, preset, true)
					}
				}
				this.instance.sendXupdate()
			},
		}

		return deviceLayerSpeedV3
	}

	/**
	 * MARK: Layer Properties - Encoder Adjust
	 */
	get deviceLayerEncoderAdjustV3() {
		// Built for rotary encoders (e.g. Stream Deck+ dials) so an operator can increment/decrement a chosen
		// layer property directly, without hand-writing an expression that reads a variable, adds a step, and
		// feeds the result back into that property's own "Layer Properties - X" action. One dropdown selects
		// which property to adjust; three step-amount fields (Raw/Percent/Pixel) are tried in that priority
		// order (first one filled in wins, per explicit user decision) - which of the three actually apply
		// depends on the chosen property (documented per-field in the tooltips below):
		// - Opacity: Raw (0-256) or Percent (of its own 0-256 range) - no Pixel (not spatial).
		// - Position X/Y, Width/Height: Raw and Pixel are the SAME thing here (the device's own raw unit for
		//   these already IS pixels, unlike Crop/Mask's 16-bit fraction) - Percent is of the screen's own canvas
		//   width/height.
		// - Crop/Mask Top/Bottom/Left/Right: Raw (the actual 0-65536 device fraction), Percent (of source
		//   resolution for Crop, of the layer's current size for Mask - same normalization already confirmed
		//   live for "Aspect & Crop"/"Mask"), or Pixel (same conversion those two actions already use).
		type DeviceLayerEncoderAdjustV3 = {
			screen: string, preset: string, layersel: string,
			value: string, direction: string,
			stepRaw: string, stepPercent: string, stepPixel: string,
			unlockIfLocked: boolean, relockAfterChange: boolean,
		}

		const resolveLayers = (opt: {screen: string, layersel: string}): {screenAuxKey: string, layerKey: string}[] => {
			const targetScreens = opt.screen === 'first'
				? this.choices.getSelectedScreens().slice(0, 1)
				: opt.screen === 'sel'
					? this.choices.getSelectedScreens()
					: this.choices.getChosenScreenAuxes(opt.screen)
			if (opt.layersel === 'sel') return this.choices.getSelectedLayers().filter(layer => targetScreens.includes(layer.screenAuxKey))
			if (opt.layersel === 'first') return this.choices.getSelectedLayers().filter(layer => targetScreens.includes(layer.screenAuxKey)).slice(0, 1)
			return targetScreens.map(screenAuxKey => ({screenAuxKey, layerKey: opt.layersel}))
		}

		const valueChoices = [
			{ id: 'opacity', label: 'Opacity' },
			{ id: 'posX', label: 'Position X' },
			{ id: 'posY', label: 'Position Y' },
			{ id: 'sizeW', label: 'Width' },
			{ id: 'sizeH', label: 'Height' },
			{ id: 'cropTop', label: 'Crop Top' },
			{ id: 'cropBottom', label: 'Crop Bottom' },
			{ id: 'cropLeft', label: 'Crop Left' },
			{ id: 'cropRight', label: 'Crop Right' },
			{ id: 'maskTop', label: 'Mask Top' },
			{ id: 'maskBottom', label: 'Mask Bottom' },
			{ id: 'maskLeft', label: 'Mask Left' },
			{ id: 'maskRight', label: 'Mask Right' },
		]

		const deviceLayerEncoderAdjustV3: AWJaction<DeviceLayerEncoderAdjustV3> = {
			name: 'Layer Properties - Encoder Adjust',
			sortName: '04 Layer Properties - 12 Encoder Adjust',
			description: 'Increments/decrements a chosen property by a step amount - built for rotary encoders, so you don\'t need to hand-write an expression for relative adjustments. Raw/Percent/Pixel are tried in that order (first one filled in wins); which apply depends on the chosen property - see each field\'s tooltip. Percent defaults to 1 (a sensible fine step for every property in the list) if left untouched.',
			options: [
				{
					id: 'screen',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screen / Aux',
					choices: [{ id: 'first', label: 'First/Only Selected Screen' }, { id: 'sel', label: 'All Selected Screens' }, ...this.choices.getScreenAuxChoices()],
					default: 'first',
				},
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset (Program/Preview)',
					choices: [{ id: 'sel', label: 'Selected Preset' }, ...this.choices.choicesPreset],
				allowInvalidValues: true,
					default: 'prw',
				},
				{
					id: 'layersel',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Layer',
					choices: [{ id: 'first', label: 'First/Only Selected Layer' }, { id: 'sel', label: 'All Selected Layers' }, ...Array.from({length: this.choices.getMaxConfiguredLayerCount()}, (_i, e: number) => ({id: (e + 1).toString(), label: `Layer ${e + 1}`}))],
					default: 'first',
				},
				{ id: 'targetHeader', type: 'static-text', label: '', value: '---', disableAutoExpression: true },
				{
					id: 'value',
					type: 'dropdown',
					label: 'Value',
					choices: valueChoices,
					default: 'opacity',
				},
				{
					id: 'direction',
					type: 'dropdown',
					label: 'Direction',
					choices: [{ id: 'increment', label: 'Increment (+)' }, { id: 'decrement', label: 'Decrement (-)' }],
					default: 'increment',
				},
				{
					id: 'stepRaw',
					type: 'textinput',
					label: 'Raw Value',
					tooltip: 'Leave empty to not use this field. Highest priority - if filled, Percent and Pixel below are ignored. Step amount in the property\'s own raw device unit (Opacity: 0-256 scale; Position/Size: pixels, same as the Pixel field below; Crop/Mask: the raw 0-65536 fraction).',
					default: '',
					useVariables: true,
				},
				{
					id: 'stepPercent',
					type: 'textinput',
					label: 'Percent',
					tooltip: 'Used only if Raw Value above is empty. Step amount as a percentage - of the property\'s own 0-256 range for Opacity, of the screen\'s canvas width/height for Position/Size, of the source\'s resolution for Crop, or of the layer\'s current size for Mask. Defaults to 1 - a sensible fine-adjustment step for every one of these values if you don\'t fill in any of the three fields at all.',
					default: '1',
					useVariables: true,
				},
				{
					id: 'stepPixel',
					type: 'textinput',
					label: 'Pixel',
					tooltip: 'Leave empty to not use this field. Used only if Raw Value and Percent above are both empty. Not applicable to Opacity (ignored). For Position/Size this is identical to Raw Value (the device\'s own raw unit already is pixels). For Crop/Mask this is pixels of the source\'s resolution (Crop) or the layer\'s current size (Mask), same conversion as the dedicated "Aspect & Crop"/"Mask" actions.',
					default: '',
					useVariables: true,
				},
				{ id: 'additionalOptionsHeader', type: 'static-text', label: '', value: '---\n**Additional Options**', disableAutoExpression: true },
				{
					// module-only convenience, not present in WebRCS - added to every "Layer Properties" action since
					// users often don't notice a screen is locked, and a locked target silently doing nothing is confusing
					id: 'unlockIfLocked',
					type: 'checkbox',
					label: 'Unlock Screen if locked?',
					tooltip: 'Unlocks all affected screens before execution if they are locked.',
					default: false,
				},
				{
					id: 'relockAfterChange',
					type: 'checkbox',
					label: 'Relock after change',
					tooltip: 'Locks all affected screens after execution if they were previously locked.',
					default: false,
					isVisibleExpression: '$(options:unlockIfLocked) == true',
				},
			],
			callback: (action) => {
				const preset = action.options.preset === 'sel' ? this.choices.getPresetSelection('sel') : action.options.preset
				const unlockedScreens = new Set<string>()
				const layers = resolveLayers(action.options)
					.filter(layer => layer.layerKey.match(/^\d+$/))
					.filter(layer => {
						if (this.choices.isLocked(layer.screenAuxKey, preset)) {
							if (!parseBoolean(action.options.unlockIfLocked)) return false
							if (!unlockedScreens.has(layer.screenAuxKey)) {
								this.choices.setScreenLock(layer.screenAuxKey, preset, false)
								unlockedScreens.add(layer.screenAuxKey)
							}
						}
						return true
					})

				const direction = action.options.direction === 'decrement' ? -1 : 1
				const rawStr = action.options.stepRaw
				const pctStr = action.options.stepPercent
				const pxStr = action.options.stepPixel
				const hasRaw = rawStr !== '' && !isNaN(Number(rawStr))
				const hasPct = pctStr !== '' && !isNaN(Number(pctStr))
				const hasPx = pxStr !== '' && !isNaN(Number(pxStr))
				if (!hasRaw && !hasPct && !hasPx) return // nothing to apply

				for (const layer of layers) {
					const screenInfo = this.choices.getScreenInfo(layer.screenAuxKey)
					const path = [
						...(screenInfo.isAux ? this.constants.auxPath : this.constants.screenPath),
						'items', screenInfo.platformId,
						'presetList', 'items', this.choices.getPreset(layer.screenAuxKey, preset),
						...this.choices.getLayerPath(layer.layerKey),
					]

					// Crop/Mask Top/Bottom/Left/Right all share the same 16-bit-fraction-of-a-dimension shape
					// (see "Aspect & Crop"/"Mask" for the confirmed-live encoding and why Crop and Mask normalize
					// against different dimensions) - one helper covers all 8.
					const applyFraction = (propPath: string[], dimension: number | '') => {
						const current = this.state.get(['DEVICE', ...path, ...propPath]) ?? 0
						let delta: number | undefined
						if (hasRaw) delta = Number(rawStr)
						else if (hasPct) delta = Number(pctStr) / 100 * 65536
						else if (hasPx && dimension !== '') delta = Number(pxStr) / dimension * 65536
						if (delta === undefined) return
						const newValue = Math.round(Math.min(65536, Math.max(0, current + direction * delta)))
						this.connection.sendWSmessage([...path, ...propPath], newValue)
					}

					// Position X/Y and Width/Height are already raw pixels at the protocol level, so Raw and
					// Pixel are the same input here - Percent is of the screen's own canvas size instead.
					const applyLinear = (propPath: string[], screenDimension: number) => {
						const current = this.state.get(['DEVICE', ...path, ...propPath]) ?? 0
						let delta: number | undefined
						if (hasRaw) delta = Number(rawStr)
						else if (hasPct) delta = Number(pctStr) / 100 * screenDimension
						else if (hasPx) delta = Number(pxStr)
						if (delta === undefined) return
						this.connection.sendWSmessage([...path, ...propPath], Math.round(current + direction * delta))
					}

					switch (action.options.value) {
						case 'opacity': {
							const current = this.state.get(['DEVICE', ...path, 'opacity', 'pp', 'opacity']) ?? 0
							let delta: number | undefined
							if (hasRaw) delta = Number(rawStr)
							else if (hasPct) delta = Number(pctStr) / 100 * 256
							// Pixel not applicable to Opacity - deliberately not checked
							if (delta === undefined) break
							const newValue = Math.round(Math.min(256, Math.max(0, current + direction * delta)))
							this.connection.sendWSmessage([...path, 'opacity', 'pp', 'opacity'], newValue)
							break
						}
						case 'posX': case 'posY': case 'sizeW': case 'sizeH': {
							const screenPath = [
								...(screenInfo.isAux ? this.constants.auxPath : this.constants.screenPath),
								'items', screenInfo.platformId,
								...this.constants.screenSizePath,
							]
							const screenSizeH = this.state.get(['DEVICE', ...screenPath, 'sizeH']) ?? 1920
							const screenSizeV = this.state.get(['DEVICE', ...screenPath, 'sizeV']) ?? 1080
							if (action.options.value === 'posX') applyLinear([...this.constants.propsPositionPath, 'posH'], screenSizeH)
							else if (action.options.value === 'posY') applyLinear([...this.constants.propsPositionPath, 'posV'], screenSizeV)
							else if (action.options.value === 'sizeW') applyLinear([...this.constants.propsSizePath, 'sizeH'], screenSizeH)
							else applyLinear([...this.constants.propsSizePath, 'sizeV'], screenSizeV)
							break
						}
						case 'cropTop': case 'cropBottom': case 'cropLeft': case 'cropRight': {
							const source = this.choices.getLayerSourceInfo(path)
							const edge = action.options.value.replace('crop', '').toLowerCase()
							const dimension = (edge === 'top' || edge === 'bottom') ? source.height : source.width
							applyFraction(['cropping', 'classic', 'pp', edge], dimension)
							break
						}
						case 'maskTop': case 'maskBottom': case 'maskLeft': case 'maskRight': {
							const sizeH = this.state.get(['DEVICE', ...path, ...this.constants.propsSizePath, 'sizeH']) ?? 1920
							const sizeV = this.state.get(['DEVICE', ...path, ...this.constants.propsSizePath, 'sizeV']) ?? 1080
							const edge = action.options.value.replace('mask', '').toLowerCase()
							const dimension = (edge === 'top' || edge === 'bottom') ? sizeV : sizeH
							applyFraction(['cropping', 'mask', 'pp', edge], dimension)
							break
						}
					}
				}

				if (parseBoolean(action.options.relockAfterChange)) {
					for (const screenAuxKey of unlockedScreens) {
						this.choices.setScreenLock(screenAuxKey, preset, true)
					}
				}
				this.instance.sendXupdate()
			},
		}

		return deviceLayerEncoderAdjustV3
	}

	/**
	 * MARK: Layer Properties - Timing
	 */
	get deviceLayerTimingV3() {
		// layerList/items/{n}/timing/{opening|closing}/pp/{start,end}, confirmed live (2026-08-27): both are raw
		// 0-65535 fractions (like the Aspect & Crop/Mask fields, but note the scale divisor here is 65535, NOT
		// 65536 like those - confirmed by two clean live data points, don't assume the two are interchangeable).
		// WebRCS's own UI shows these as milliseconds, not raw or percent - confirmed formula:
		// raw = round(ms / relevantTransitionMs * 65535), where relevantTransitionMs is *this screen's own*
		// takeUpTime or takeDownTime (whichever direction currently brings this layer's preset side into
		// program - the same up/down convention already used by "Screen - Set Transition Time"), confirmed live
		// both Opening AND Closing scale against the SAME single direction (not one each). There's also a third
		// raw value, layerList/items/{n}/timing/pp/ratio (0-65535, def 32768), confirmed NOT shown anywhere in
		// WebRCS's own UI - deliberately left out of this action entirely, per the "match WebRCS exactly" rule.
		type DeviceLayerTimingV3 = {
			screen: string, preset: string, layersel: string,
			openingStartMs: string, openingEndMs: string,
			closingStartMs: string, closingEndMs: string,
			unlockIfLocked: boolean, relockAfterChange: boolean,
		}

		const resolveLayers = (opt: {screen: string, layersel: string}): {screenAuxKey: string, layerKey: string}[] => {
			const targetScreens = opt.screen === 'first'
				? this.choices.getSelectedScreens().slice(0, 1)
				: opt.screen === 'sel'
					? this.choices.getSelectedScreens()
					: this.choices.getChosenScreenAuxes(opt.screen)
			if (opt.layersel === 'sel') return this.choices.getSelectedLayers().filter(layer => targetScreens.includes(layer.screenAuxKey))
			if (opt.layersel === 'first') return this.choices.getSelectedLayers().filter(layer => targetScreens.includes(layer.screenAuxKey)).slice(0, 1)
			return targetScreens.map(screenAuxKey => ({screenAuxKey, layerKey: opt.layersel}))
		}

		// Finds whichever of takeUpTime/takeDownTime corresponds to the transition that brings the given
		// preset (A/B) side of this screen into program, and returns it in milliseconds - or undefined if the
		// screen's presetUp/presetDown assignment can't be read.
		const getRelevantTransitionMs = (screenAuxKey: string, presetKey: string): number | undefined => {
			const groupPath = [...this.constants.screenGroupPath, 'items', screenAuxKey, 'control', 'pp']
			const presetUp = this.state.get(['DEVICE', ...groupPath, 'presetUp'])
			const presetDown = this.state.get(['DEVICE', ...groupPath, 'presetDown'])
			const deciseconds = presetKey === presetUp
				? this.state.get(['DEVICE', ...groupPath, 'takeUpTime'])
				: presetKey === presetDown
					? this.state.get(['DEVICE', ...groupPath, 'takeDownTime'])
					: undefined
			return typeof deciseconds === 'number' ? deciseconds * 100 : undefined
		}

		const msTooltip = () =>
			'Leave empty to not change this value. Milliseconds, matching WebRCS\'s own display (confirmed live: raw=round(ms/transitionMs*65535), using this screen\'s own transition time for whichever side this layer\'s preset currently is). Falls back silently if that transition time can\'t be determined.'

		const deviceLayerTimingV3: AWJaction<DeviceLayerTimingV3> = {
			name: 'Layer Properties - Timing',
			sortName: '04 Layer Properties - 11 Timing',
			description: 'Covers WebRCS\'s Layer Properties "Timing" panel (Opening/Closing Start/End, shown in WebRCS as milliseconds).',
			options: [
				{
					id: 'screen',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screen / Aux',
					choices: [{ id: 'first', label: 'First/Only Selected Screen' }, { id: 'sel', label: 'All Selected Screens' }, ...this.choices.getScreenAuxChoices()],
					default: 'first',
				},
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset (Program/Preview)',
					choices: [{ id: 'sel', label: 'Selected Preset' }, ...this.choices.choicesPreset],
				allowInvalidValues: true,
					default: 'prw',
				},
				{
					id: 'layersel',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Layer',
					choices: [{ id: 'first', label: 'First/Only Selected Layer' }, { id: 'sel', label: 'All Selected Layers' }, ...Array.from({length: this.choices.getMaxConfiguredLayerCount()}, (_i, e: number) => ({id: (e + 1).toString(), label: `Layer ${e + 1}`}))],
					default: 'first',
				},
				{ id: 'openingHeader', type: 'static-text', label: '', value: '---\n**Opening**', disableAutoExpression: true },
				{ id: 'openingStartMs', type: 'textinput', label: 'Start (ms)', tooltip: msTooltip(), default: '', useVariables: true },
				{ id: 'openingEndMs', type: 'textinput', label: 'End (ms)', tooltip: msTooltip(), default: '', useVariables: true },
				{ id: 'closingHeader', type: 'static-text', label: '', value: '---\n**Closing**', disableAutoExpression: true },
				{ id: 'closingStartMs', type: 'textinput', label: 'Start (ms)', tooltip: msTooltip(), default: '', useVariables: true },
				{ id: 'closingEndMs', type: 'textinput', label: 'End (ms)', tooltip: msTooltip(), default: '', useVariables: true },
				{ id: 'additionalOptionsHeader', type: 'static-text', label: '', value: '---\n**Additional Options**', disableAutoExpression: true },
				{
					// module-only convenience, not present in WebRCS - added to every "Layer Properties" action since
					// users often don't notice a screen is locked, and a locked target silently doing nothing is confusing
					id: 'unlockIfLocked',
					type: 'checkbox',
					label: 'Unlock Screen if locked?',
					tooltip: 'Unlocks all affected screens before execution if they are locked.',
					default: false,
				},
				{
					id: 'relockAfterChange',
					type: 'checkbox',
					label: 'Relock after change',
					tooltip: 'Locks all affected screens after execution if they were previously locked.',
					default: false,
					isVisibleExpression: '$(options:unlockIfLocked) == true',
				},
			],
			// "Get current values" (Companion's standard blue "Learn" button) - reads the first resolved layer's
			// current timing and pins screen/preset/layer to the concrete values it read from.
			learn: (action) => {
				const layers = resolveLayers(action.options).filter(layer => layer.layerKey.match(/^\d+$/))
				if (layers.length === 0) return undefined

				const preset = this.choices.getPresetSelection()
				const screenInfo = this.choices.getScreenInfo(layers[0].screenAuxKey)
				const presetKey = this.choices.getPreset(screenInfo.id, preset)
				const path = [
					...(screenInfo.isAux ? this.constants.auxPath : this.constants.screenPath),
					'items', screenInfo.platformId,
					'presetList', 'items', presetKey,
					...this.choices.getLayerPath(layers[0].layerKey),
				]

				const newoptions: Partial<DeviceLayerTimingV3> = {
					screen: screenInfo.id,
					layersel: layers[0].layerKey,
					preset,
				}

				const transitionMs = getRelevantTransitionMs(layers[0].screenAuxKey, presetKey)
				if (transitionMs !== undefined) {
					const readFields: [keyof DeviceLayerTimingV3, string[]][] = [
						['openingStartMs', ['timing', 'opening', 'pp', 'start']],
						['openingEndMs', ['timing', 'opening', 'pp', 'end']],
						['closingStartMs', ['timing', 'closing', 'pp', 'start']],
						['closingEndMs', ['timing', 'closing', 'pp', 'end']],
					]
					for (const [msId, prop] of readFields) {
						const raw = this.state.get(['DEVICE', ...path, ...prop])
						if (typeof raw === 'number') (newoptions[msId] as string) = Math.round(raw / 65535 * transitionMs).toString()
					}
				}

				return newoptions
			},
			callback: (action) => {
				const preset = action.options.preset === 'sel' ? this.choices.getPresetSelection('sel') : action.options.preset
				const unlockedScreens = new Set<string>()
				const layers = resolveLayers(action.options)
					.filter(layer => layer.layerKey.match(/^\d+$/))
					.filter(layer => {
						if (this.choices.isLocked(layer.screenAuxKey, preset)) {
							if (!parseBoolean(action.options.unlockIfLocked)) return false
							if (!unlockedScreens.has(layer.screenAuxKey)) {
								this.choices.setScreenLock(layer.screenAuxKey, preset, false)
								unlockedScreens.add(layer.screenAuxKey)
							}
						}
						return true
					})

				const fields: [keyof DeviceLayerTimingV3, string[]][] = [
					['openingStartMs', ['timing', 'opening', 'pp', 'start']],
					['openingEndMs', ['timing', 'opening', 'pp', 'end']],
					['closingStartMs', ['timing', 'closing', 'pp', 'start']],
					['closingEndMs', ['timing', 'closing', 'pp', 'end']],
				]

				for (const layer of layers) {
					const screenInfo = this.choices.getScreenInfo(layer.screenAuxKey)
					const presetKey = this.choices.getPreset(layer.screenAuxKey, preset)
					const path = [
						...(screenInfo.isAux ? this.constants.auxPath : this.constants.screenPath),
						'items', screenInfo.platformId,
						'presetList', 'items', presetKey,
						...this.choices.getLayerPath(layer.layerKey),
					]

					let transitionMs: number | undefined
					for (const [msId, prop] of fields) {
						const msStr = action.options[msId] as string
						if (msStr === '' || isNaN(Number(msStr))) continue
						transitionMs ??= getRelevantTransitionMs(layer.screenAuxKey, presetKey)
						if (transitionMs === undefined || transitionMs <= 0) continue
						const value = Math.round(Number(msStr) / transitionMs * 65535)
						this.connection.sendWSmessage([...path, ...prop], Math.min(65535, Math.max(0, value)))
					}
				}

				if (parseBoolean(action.options.relockAfterChange)) {
					for (const screenAuxKey of unlockedScreens) {
						this.choices.setScreenLock(screenAuxKey, preset, true)
					}
				}
				this.instance.sendXupdate()
			},
		}

		return deviceLayerTimingV3
	}

	/**
	 * MARK: Set Anchor Point
	 * Sets the globally selected Anchor Point (the same shared value WebRCS's own Position & Size panel
	 * uses and displays - confirmed live: writing it here updates WebRCS's display and vice versa). Also
	 * settable implicitly by picking a point in "Set Layer Position and Size V3"; this action exists for
	 * setting it on its own, e.g. from a dedicated row of anchor-point buttons.
	 */
	get deviceSetAnchorPoint() {
		type DeviceSetAnchorPoint = { anchor: AnchorPoint }

		const deviceSetAnchorPoint: AWJaction<DeviceSetAnchorPoint> = {
			name: 'Layer Properties - Set Anchor Point',
			sortName: '04 Layer Properties - 15 Set Anchor Point',
			description: 'Sets the global Anchor Point (the same WebRCS-wide setting shown in WebRCS), which determines the reference corner/edge/center used by Position & Size actions and variables.',
			options: [
				{
					id: 'anchor',
					type: 'dropdown',
					label: 'Anchor Point',
					choices: this.choices.getAnchorPointChoices(),
					default: 'CENTER',
				},
			],
			callback: (action) => {
				this.connection.sendWSdata('REMOTE', 'setAnchorPoint', '/live/screens/layers', [action.options.anchor])
			},
		}

		return deviceSetAnchorPoint
	}

	/**
	 * MARK: Reset Layer Size or Ratio
	 * Mirrors WebRCS's own layer-toolbar buttons "Set Layer size to source ratio", "Set Layer size to its
	 * content size" and "Set to full screen" - all three are computed client-side in WebRCS from the
	 * layer's current source resolution / the screen's canvas resolution, not backed by a dedicated device
	 * command, so this action reproduces that same math instead of sending a special command.
	 * Source Ratio keeps the current height and derives the width from the source's aspect ratio. Content
	 * Size takes the source's pixel-exact resolution. Both keep the chosen Anchor Point visually fixed
	 * while the box resizes, exactly like Set Layer Position and Size V3. Fullscreen ignores aspect ratio
	 * and the anchor entirely and always covers the screen/aux exactly.
	 */
	get deviceResetLayerSize() {
		type DeviceResetLayerSize = {screen: string, preset: string, layersel: string, anchor: AnchorPoint | 'sel', mode: 'sourceRatio' | 'contentSize' | 'fullscreen'} & Record<string, string>
		type LayerPositionData = {path: string[], posH: number, posV: number, sizeH: number, sizeV: number}

		const convertAnchorPosition = this.choices.convertAnchorPosition.bind(this.choices)

		const getLayerPositionData = (screenId: string, preset: string, layerId: string): LayerPositionData | undefined => {
			const screninfo = this.choices.getScreenInfo(screenId)
			const presetKey = this.choices.getPreset(screninfo.id, preset)
			const path = [
				...(screninfo.isAux ? this.constants.auxPath : this.constants.screenPath),
				'items', screninfo.platformId,
				'presetList', 'items', presetKey,
				...this.choices.getLayerPath(layerId)
			]

			if (this.state.get(['DEVICE', ...path, ...this.constants.propsSizePath]) === undefined) return undefined // this layer does not allow for sizing

			return {
				path,
				posH: this.state.get(['DEVICE', ...path, ...this.constants.propsPositionPath, 'posH']) ?? 0,
				posV: this.state.get(['DEVICE', ...path, ...this.constants.propsPositionPath, 'posV']) ?? 0,
				sizeH: this.state.get(['DEVICE', ...path, ...this.constants.propsSizePath, 'sizeH']) ?? 1920,
				sizeV: this.state.get(['DEVICE', ...path, ...this.constants.propsSizePath, 'sizeV']) ?? 1080,
			}
		}

		/** Resolves the "screen"/"layersel" options into concrete target layers. "First/Only Selected Layer"
		 * targets just the first (Ctrl-clicked first in WebRCS, same layer the SelectedLayer.* variables
		 * describe) of a multi-selection - safer than "all selected layers" for Source Ratio/Content Size, which
		 * resize relative to each layer's own current size. A single "Layer" field covers every screen choice -
		 * there used to be one hidden field per screen instead, shown/hidden via isVisibleExpression depending on
		 * the "screen" field's value, but Companion's isVisibleExpression evaluation turned out to be unreliable
		 * for fields depending on another field that has disableAutoExpression set (as "screen" did, needed only
		 * for that now-removed cross-field dependency) - occasionally showing several of them at once instead of
		 * exactly one (same issue and fix as in "Set Layer Position and Size V3"). */
		const resolveLayers = (opt: DeviceResetLayerSize): {screenAuxKey: string, layerKey: string}[] => {
			const targetScreens = opt.screen === 'first'
				? this.choices.getSelectedScreens().slice(0, 1)
				: opt.screen === 'sel'
					? this.choices.getSelectedScreens()
					: [opt.screen]
			if (opt.layersel === 'sel') return this.choices.getSelectedLayers().filter(layer => targetScreens.includes(layer.screenAuxKey))
			if (opt.layersel === 'first') return this.choices.getSelectedLayers().filter(layer => targetScreens.includes(layer.screenAuxKey)).slice(0, 1)
			return targetScreens.map(screenAuxKey => ({screenAuxKey, layerKey: opt.layersel}))
		}

		const deviceResetLayerSize: AWJaction<DeviceResetLayerSize> = {
			name: 'Layer Properties - Reset Size or Ratio',
			sortName: '04 Layer Properties - 16 Reset Size or Ratio',
			description: 'Mirrors WebRCS\'s own layer-toolbar buttons: resizes a Layer to its source\'s aspect ratio, to the source\'s exact pixel resolution, or to fill the whole Screen/Aux - keeping the chosen Anchor Point fixed while it resizes.',
			options: [
				{
					id: 'screen',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screen / Aux',
					tooltip: 'When several screens/auxes are selected (common in daily use), "First/Only Selected Screen" targets just the first (Ctrl-clicked first in WebRCS, same screen the SelectedScreen.* variables describe) - safer than "All Selected Screens" for Source Ratio/Content Size, which resize relative to each layer\'s own current size, so applying to layers on every selected screen at once could resize layers differently than intended.',
					choices: [{ id: 'first', label: 'First/Only Selected Screen' }, { id: 'sel', label: 'All Selected Screens' }, ...this.choices.getScreenAuxChoices()],
					default: 'first',
				},
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset (Program/Preview)',
					choices: [{ id: 'sel', label: 'Selected Preset' }, ...this.choices.choicesPreset],
				allowInvalidValues: true,
					default: 'prw',
				},
				{
					id: `layersel`,
					type: 'dropdown',
					label: 'Layer',
					tooltip: 'When using "selected layer" and screen or preset are not using "Selected", you can narrow the selection. "First/Only Selected Layer" targets just the first (Ctrl-clicked first in WebRCS, same layer the SelectedLayer.* variables describe) of a multi-selection - safer to use with Source Ratio/Content Size, which resize relative to each layer\'s own current size, so applying to every selected layer at once could resize layers differently than intended.',
					choices: [{ id: 'sel', label: 'All Selected Layers' }, { id: 'first', label: 'First/Only Selected Layer' }, ...Array.from({length: this.choices.getMaxConfiguredLayerCount()}, (_i, e:number) => {return {id: e+1, label: `Layer ${e+1}`}})],
					default: 'first',
				},
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Set Layer Size to',
					choices: [
						{ id: 'sourceRatio', label: 'Source Ratio' },
						{ id: 'contentSize', label: 'its Content Size' },
						{ id: 'fullscreen', label: 'Fullscreen' },
					],
					default: 'sourceRatio',
				},
				{
					id: 'anchor',
					type: 'dropdown',
					label: 'Anchor Point',
					tooltip: 'Which point of the layer box stays visually fixed while resizing, exactly like the anchor point selector in WebRCS. Has no effect with "Fullscreen". Picking a fixed point here also becomes the new globally selected Anchor Point (same as using the "Set Anchor Point" action), so WebRCS and the SelectedLayer.x/.y variables stay in sync with it.',
					choices: [{ id: 'sel', label: 'Use Global Anchor Point' }, ...this.choices.getAnchorPointChoices()],
					default: 'sel',
					isVisibleExpression: "$(options:mode) != 'fullscreen'",
				},
			],
			callback: async (action) => {
				let layers = resolveLayers(action.options)

				const preset = action.options.preset === 'sel' ? this.choices.getPresetSelection('sel') : action.options.preset
				layers = layers.filter(layer => (!this.choices.isLocked(layer.screenAuxKey, preset) && layer.layerKey.match(/^\d+$/))) // wipe out layers of locked screens and native layer
				if (layers.length === 0) return

				let anchor: AnchorPoint
				if (action.options.anchor === 'sel' || action.options.anchor === undefined) {
					anchor = this.choices.getGlobalAnchorPoint()
				} else {
					anchor = action.options.anchor
					if (anchor !== this.choices.getGlobalAnchorPoint()) {
						this.connection.sendWSdata('REMOTE', 'setAnchorPoint', '/live/screens/layers', [anchor])
					}
				}

				for (const layer of layers) {
					const laydata = getLayerPositionData(layer.screenAuxKey, preset, layer.layerKey)
					if (laydata === undefined) continue // this layer does not allow for sizing

					let targetSizeH: number
					let targetSizeV: number
					let newPosH: number | undefined
					let newPosV: number | undefined

					if (action.options.mode === 'fullscreen') {
						const screninfo = this.choices.getScreenInfo(layer.screenAuxKey)
						const screenpath = [
							...(screninfo.isAux ? this.constants.auxPath : this.constants.screenPath),
							'items', screninfo.platformId,
							...this.constants.screenSizePath
						]
						const screenWidth = this.state.get(['DEVICE', ...screenpath, 'sizeH']) ?? 1920
						const screenHeight = this.state.get(['DEVICE', ...screenpath, 'sizeV']) ?? 1080
						targetSizeH = screenWidth
						targetSizeV = screenHeight
						newPosH = Math.round(screenWidth / 2)
						newPosV = Math.round(screenHeight / 2)
					} else {
						const source = this.choices.getLayerSourceInfo(laydata.path)
						if (source.width === '' || source.height === '') continue // unknown source resolution - nothing to derive from, leave untouched

						if (action.options.mode === 'sourceRatio') {
							targetSizeV = laydata.sizeV
							targetSizeH = Math.round(targetSizeV * source.width / source.height)
						} else {
							targetSizeH = source.width
							targetSizeV = source.height
						}

						// Keep the chosen anchor point visually fixed while the box resizes, exactly like the
						// resize-compensation in Set Layer Position and Size V3.
						if (anchor !== 'CENTER' && (targetSizeH !== laydata.sizeH || targetSizeV !== laydata.sizeV)) {
							const currentAnchorPos = convertAnchorPosition(laydata.posH, laydata.posV, laydata.sizeH, laydata.sizeV, 'CENTER', anchor)
							const compensatedPos = convertAnchorPosition(currentAnchorPos.x, currentAnchorPos.y, targetSizeH, targetSizeV, anchor, 'CENTER')
							newPosH = compensatedPos.x
							newPosV = compensatedPos.y
						}
					}

					if (newPosH !== undefined && newPosH !== laydata.posH) {
						this.state.set(['DEVICE', ...laydata.path, ...this.constants.propsPositionPath, 'posH'], newPosH)
						this.connection.sendWSmessage([...laydata.path, ...this.constants.propsPositionPath, 'posH'], newPosH)
					}
					if (newPosV !== undefined && newPosV !== laydata.posV) {
						this.state.set(['DEVICE', ...laydata.path, ...this.constants.propsPositionPath, 'posV'], newPosV)
						this.connection.sendWSmessage([...laydata.path, ...this.constants.propsPositionPath, 'posV'], newPosV)
					}
					if (targetSizeH !== laydata.sizeH) {
						this.state.set(['DEVICE', ...laydata.path, ...this.constants.propsSizePath, 'sizeH'], targetSizeH)
						this.connection.sendWSmessage([...laydata.path, ...this.constants.propsSizePath, 'sizeH'], targetSizeH)
					}
					if (targetSizeV !== laydata.sizeV) {
						this.state.set(['DEVICE', ...laydata.path, ...this.constants.propsSizePath, 'sizeV'], targetSizeV)
						this.connection.sendWSmessage([...laydata.path, ...this.constants.propsSizePath, 'sizeV'], targetSizeV)
					}
				}

				this.instance.sendXupdate()
			},
		}

		return deviceResetLayerSize
	}

	/**
	 * MARK: Layer position and size (deprecated V2)
	 * Fully independent copy of devicePositionSizeV3 under the old action id, so existing shows using it keep
	 * working untouched and this code can be left frozen while V3 gets rebuilt with a different coordinate model.
	 * Every option field here has disableAutoExpression: true (the new "switch to expression" toggle was never
	 * available on this action before, so this can't regress anyone), to keep that capability exclusive to V3.
	 */
	get devicePositionSize() {
		type DevicePositionSize = {screen: string, preset: string, layersel: string, parameters: string[], x: string, xAnchor: string, y: string, yAnchor: string, w: string, h: string, ar: string} & Record<string, string>
		type Layer = {screenAuxKey: string, layerKey: string, x: number, y: number, w: number, h: number, isPositionable: boolean, [name: string]: number | string | boolean}


		const calculateAr = (widthOrAr: number, height?: number) => {
			let ar: number
			let lowerAr: number
			let upperAr: number
			const knownArs = [
				{value: 16/9,  string:'16/9'},
				{value: 16/10, string:'16/10'},
				{value: 4/3,   string:'4/3'},
				{value: 5/4,   string:'5/4'},
				{value: 21/9,  string:'21/9'},
				{value: 1,     string:'1/1'},
				{value: 2/3,   string:'2/3'},
				{value: 9/16,  string:'9/16'},
				{value: 10/16, string:'10/16'},
				{value: 32/9,  string:'32/9'},
			]
			if (typeof height !== 'number') {
				ar = widthOrAr
				lowerAr = 100 * ar - 0.5 / 100
				upperAr = 100 * ar + 0.5 / 100
			} else {
				if (height == 0) return undefined
				ar = widthOrAr / height
				if (height < widthOrAr) {
					lowerAr = widthOrAr / (height+0.5)
					upperAr = widthOrAr / (height-0.5)
				} else {
					lowerAr = (widthOrAr-0.5) / height
					upperAr = (widthOrAr+0.5) / height
				}
			}
			for (const knownAr of knownArs) {
				if (knownAr.value >= lowerAr && knownAr.value <= upperAr) {
					return knownAr
				}
			}
			return {value: ar, string: (Math.round(ar*100000000)/100000000).toString(10)}

		}

		const tooltip =
			`start with "inc" to increase by amount,
start with "dec" to decrease by amount,
otherwise set value.
You can use expression syntax with operators like +, -, *, /, (), ?:,  ...
You can use the following keywords to be replaced on execution time:
lw: layer width, lh: layer height, lx: layer left edge, ly: layer top edge, la: layer aspect ratio,
bw: box width, bh: box height, bx: box left edge, by: box top edge, ba: box aspect ratio,
iw: layer source width, ih: layer source height, ia: layer source aspect ratio,
l1w, l1h, l1x, l1y, l1a: values of the first layer in the selection (leader), you can access all layers' properties with their number
sw: screen width, sh: screen height, sa: screen aspect ratio, layer: layer name, screen: screen name, amount: count of selected layers`

		const parseExpressionString = (expression: string, context: {[name: string]: number | string | boolean}, initialValue = 0) => {
			let relate: (n: number) => number
			if (expression.toLowerCase().startsWith('inc')) {
				relate = (n) => initialValue + n
				expression = expression.substring(3)
			} else if (expression.toLowerCase().startsWith('dec')) {
				relate = (n) => initialValue - n
				expression = expression.substring(3)
			} else {
				relate = (n) => n
			}
			let result:any = undefined
			try {
				const expressionFn = compileExpression(expression)
				result = expressionFn(context)
			} catch (_error) {
				// fail silent
			}
			if (typeof result === 'number') {
				return relate(result)
			}
			return 0
		}

		const getLayerDimensions = (screenId: string, preset: string, layerId: string) => {
			const screninfo = this.choices.getScreenInfo(screenId)
			const presetKey = this.choices.getPreset(screninfo.id, preset)
			const pathToLayer = [
				...(screninfo.isAux ? this.constants.auxPath : this.constants.screenPath),
				'items', screninfo.platformId,
				'presetList','items',presetKey,
				...this.choices.getLayerPath(layerId)
			]

			if (this.state.get(['DEVICE', ...pathToLayer, ...this.constants.propsSizePath]) === undefined) return undefined // this layer does not allow for sizing

			const layer = {
				w: 0,
				h: 0,
				x: 0,
				y: 0,
				wOriginal: 0,
				hOriginal: 0,
				xOriginal: 0,
				yOriginal: 0,
				path: pathToLayer
			}

			layer.w = this.state.get(['DEVICE', ...pathToLayer, ...this.constants.propsSizePath, 'sizeH']) ?? 1920
			layer.wOriginal = layer.w
			layer.h = this.state.get(['DEVICE', ...pathToLayer, ...this.constants.propsSizePath, 'sizeV']) ?? 1080
			layer.hOriginal = layer.h
			layer.x = (this.state.get(['DEVICE', ...pathToLayer, ...this.constants.propsPositionPath, 'posH']) ?? 0) - layer.w / 2
			layer.xOriginal = layer.x
			layer.y = (this.state.get(['DEVICE', ...pathToLayer, ...this.constants.propsPositionPath, 'posV']) ?? 0) - layer.h / 2
			layer.yOriginal = layer.y

			return layer
		}

		const getBoundingBox = (layers: Layer[], preset: string) => {
			const boundingBoxes = {}

			for (const layerIndex in layers) {
				const layer: Layer = layers[layerIndex]
				const presetKey = this.choices.getPreset(layer.screenAuxKey, preset)
				const screninfo = this.choices.getScreenInfo(layer.screenAuxKey)

				const laydim = getLayerDimensions(screninfo.id, presetKey, layer.layerKey)
				if (laydim === undefined) {
					layers[layerIndex].isPositionable = false
					continue // this layer does not allow for sizing
				} else {
					layers[layerIndex].isPositionable = true
				}

				Object.keys(laydim).forEach((key) => {layer[key] = laydim[key]})

				if (boundingBoxes[layer.screenAuxKey] === undefined ) boundingBoxes[layer.screenAuxKey] = {}
				const box = boundingBoxes[layer.screenAuxKey]
				if (box.x === undefined  || layer.x < box.x) box.x = layer.x
				if (box.y === undefined  || layer.y < box.y) box.y = layer.y
				if (box.right === undefined  || layer.x + layer.w > box.right) box.right = layer.x + layer.w
				if (box.bottom === undefined  || layer.y + layer.h > box.bottom) box.bottom = layer.y + layer.h
			}

			return boundingBoxes
		}

		const getAllLayerValues = (layers: Layer[]) => {
			const count = layers.length
			return layers.reduce((prev, layer, layIdx) => {
					return {
						...prev,
						[`l${layIdx + 1}w`]: layer.w,
						[`l${layIdx + 1}h`]: layer.h,
						[`l${layIdx + 1}x`]: layer.x,
						[`l${layIdx + 1}y`]: layer.y,
						[`l${layIdx + 1}a`]: calculateAr(layer.w, layer.h)?.value ?? 0
					}
				}, {
					sx: 0,
					sy: 0,
					amount: count
				})
		}

		const getLayerContext = (layer: any, layerIndex: number, preset: string, boundingBoxes: ReturnType<typeof getBoundingBox>, allLayerValues: ReturnType<typeof getAllLayerValues>) => {
			const screninfo = this.choices.getScreenInfo(layer.screenAuxKey)
			const presetKey = this.choices.getPreset(layer.screenAuxKey, preset)
			const laydim = getLayerDimensions(screninfo.id, presetKey, layer.layerKey)
			if (laydim === undefined) return // this layer does not allow for sizing
			Object.keys(laydim).forEach((key) => {layer[key] = laydim[key]})

			const screenpath = screninfo.isAux ? this.constants.auxPath : this.constants.screenPath
			const path = [
				...screenpath,
				'items', screninfo.platformId,
				...this.constants.screenSizePath
			]
			const screenWidth = this.state.get(['DEVICE', ...path, 'sizeH'])
			const screenHeight = this.state.get(['DEVICE', ...path, 'sizeV'])

			layer.input = this.state.get(['DEVICE', ...layer.path,'source','pp','inputNum']) ?? 'NONE'

			if (layer.input?.match(/^IN/)) {
				layer.inPlug = this.state.get(`DEVICE/device/inputList/items/${layer.input}/control/pp/plug`) || '1'
				layer.inWidth = this.state.get(`DEVICE/device/inputList/items/${layer.input}/plugList/items/${layer.inPlug}/status/signal/pp/imageWidth`) || 0
				layer.inHeight = this.state.get(`DEVICE/device/inputList/items/${layer.input}/plugList/items/${layer.inPlug}/status/signal/pp/imageHeight`) || 0
			} else {
				layer.inWidth = 0
				layer.inHeight = 0
			}

			const boxWidth = boundingBoxes[layer.screenAuxKey]?.right - boundingBoxes[layer.screenAuxKey]?.x
			const boxHeight = boundingBoxes[layer.screenAuxKey]?.bottom - boundingBoxes[layer.screenAuxKey]?.y

			const context = {
				sw: screenWidth,
				sh: screenHeight,
				sa: calculateAr(screenWidth, screenHeight)?.value ?? 0,
				lw: layer.w,
				lh: layer.h,
				lx: layer.x,
				ly: layer.y,
				la: calculateAr(layer.w, layer.h)?.value ?? 0,
				bx: boundingBoxes[layer.screenAuxKey]?.x ?? layer.x,
				by: boundingBoxes[layer.screenAuxKey]?.y ?? layer.y,
				bw: boxWidth,
				bh: boxHeight,
				ba: calculateAr(boxWidth, boxHeight)?.value ?? 0,
				iw: layer.inWidth,
				ih: layer.inHeight,
				ia: calculateAr(layer.inWidth, layer.inHeight)?.value ?? 0,
				screen: layer.screenAuxKey,
				layer: layer.layerKey,
				index: layerIndex,
				...allLayerValues
			}
			return context
		}

		const devicePositionSize: AWJaction<DevicePositionSize> = {
			name: 'Deprecated from V2 - Set Position and Size (please upgrade to new action V3)',
			sortName: '12 Deprecated from V2 - Set Position and Size',
			description: 'Deprecated - replaced by "Layer Properties - Position & Size". Sets a Layer\'s position and/or size.',
			options: [
				{
					id: 'screen',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screen / Aux',
					choices: [{ id: 'sel', label: 'All Selected Screens' }, ...this.choices.getScreenAuxChoices()],
					default: 'sel',
					disableAutoExpression: true,
				},
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset (Program/Preview)',
					choices: [{ id: 'sel', label: 'Selected Preset' }, ...this.choices.choicesPreset],
				allowInvalidValues: true,
					default: 'prw',
					disableAutoExpression: true,
				},
				{
					id: `layersel`,
					type: 'dropdown',
					label: 'Layer',
					tooltip: 'When using "selected layer" and screen or preset are not using "Selected", you can narrow the selection',
					choices: [{ id: 'sel', label: 'Selected Layer(s)' }, ...Array.from({length: this.constants.maxLayers}, (_i, e:number) => {return {id: e+1, label: `Layer ${e+1}`}})],
					default: 'sel',
					isVisibleExpression: "$(options:screen) == 'sel'",
					disableAutoExpression: true,
				},
				...this.screens.map((screen) => {
					return{
						id: `layer${screen.id}`,
						type: 'dropdown' as const,
						label: 'Layer',
						tooltip: 'When using "selected layer" and screen or preset are not using "Selected", you can narrow the selection',
						choices: [{ id: 'sel', label: 'Selected Layer(s)' }, ...this.choices.getLayerChoices(screen.id, false)],
						default: 'sel',
						isVisibleExpression: `$(options:screen) == '${screen.id}'`,
						disableAutoExpression: true,
					}
				}),
				{
					id: 'parameters',
					type: 'multidropdown',
					label: 'Act on',
					choices: [
						{ id: 'x', label: 'X Position' },
						{ id: 'y', label: 'Y Position' },
						{ id: 'w', label: 'Width' },
						{ id: 'h', label: 'Height' },
					],
					default: ['x', 'y', 'w', 'h'],
					disableAutoExpression: true,
				},
				{
					id: 'x',
					type: 'textinput',
					label: 'X position in screen (pixels)',
					tooltip,
					default: '',
					useVariables: true,
					isVisibleExpression: "arrayIncludes($(options:parameters), 'x')",
					disableAutoExpression: true,
				},
				{
					id: 'y',
					type: 'textinput',
					label: 'Y position in screen (pixels)',
					tooltip,
					default: '',
					useVariables: true,
					isVisibleExpression: "arrayIncludes($(options:parameters), 'y')",
					disableAutoExpression: true,
				},
				{
					id: 'w',
					type: 'textinput',
					label: 'Width (pixels)',
					tooltip,
					default: '',
					useVariables: true,
					isVisibleExpression: "arrayIncludes($(options:parameters), 'w')",
					disableAutoExpression: true,
				},
				{
					id: 'h',
					type: 'textinput',
					label: 'Height (pixels)',
					tooltip,
					default: '',
					useVariables: true,
					isVisibleExpression: "arrayIncludes($(options:parameters), 'h')",
					disableAutoExpression: true,
				},
				{
					id: 'xAnchor',
					type: 'textinput',
					label: 'Anchor X position',
					tooltip,
					default: 'lx + 0.5 * lw',
					useVariables: true,
					isVisibleExpression: "arrayIncludes($(options:parameters), 'x') || arrayIncludes($(options:parameters), 'w') || arrayIncludes($(options:parameters), 'h')",
					disableAutoExpression: true,
				},
				{
					id: 'yAnchor',
					type: 'textinput',
					label: 'Anchor Y position',
					tooltip,
					default: 'ly + 0.5 * lh',
					useVariables: true,
					isVisibleExpression: "arrayIncludes($(options:parameters), 'y') || arrayIncludes($(options:parameters), 'w') || arrayIncludes($(options:parameters), 'h')",
					disableAutoExpression: true,
				},
				{
					id: 'ar',
					type: 'textinput',
					label: 'Aspect Ratio',
					tooltip: `use "keep" to keep the aspect ratio, use notations like 16/9, 4/3, 1.678 to set to a specific ratio, use nothing or any other word to change aspect ratio`,
					default: '',
					useVariables: true,
					isVisibleExpression: "(arrayIncludes($(options:parameters), 'h') && !arrayIncludes($(options:parameters), 'w')) || (!arrayIncludes($(options:parameters), 'h') && arrayIncludes($(options:parameters), 'w'))",
					disableAutoExpression: true,
				},
			],
			learn: async (action) => {
				const options = action.options
				const newoptions:Partial<DevicePositionSize> = {}

				let layers: Layer[] //{screenAuxKey: string, layerKey: string}[]
				if (options.screen === 'sel') {
					if (options.layersel === 'sel') {
						layers = this.choices.getSelectedLayers() as Layer[]
					} else {
						layers = [{screenAuxKey: options.screen, layerKey: options.layersel}] as Layer[]
					}
				} else {
					if (options[`layer${options.screen}`] === 'sel') {
						layers = this.choices.getSelectedLayers().filter(layer => layer.screenAuxKey == options.screen) as Layer[]
					} else {
						layers = [{screenAuxKey: options.screen, layerKey: options[`layer${options.screen}`]}] as Layer[]
					}
				}

				if (layers.length === 0) return undefined

				const preset = this.choices.getPresetSelection()
				const boundingBoxes = getBoundingBox(layers, preset)

				layers = layers.filter(layer => layer.isPositionable)

				const allLayerValues = getAllLayerValues(layers)

				const [screen, layer] = [layers[0].screenAuxKey, layers[0].layerKey]
				const screeninfo = this.choices.getScreenInfo(screen)

				const context = getLayerContext(layers[0], 1, preset, boundingBoxes, allLayerValues )

				if (context === undefined) return undefined

				newoptions.screen = screeninfo.id
				newoptions[`layer${screeninfo.id}`] = layer.replace(/^\w+_/, '')
				newoptions.preset = preset

				newoptions.parameters = ['x', 'y', 'w', 'h']

				let   xAnchor     = parseExpressionString(action.options.xAnchor, context, 0)
				let   yAnchor     = parseExpressionString(action.options.yAnchor, context, 0)


				newoptions.w = context.lw.toString()
				newoptions.h = context.lh.toString()
				newoptions.x = (xAnchor).toString()
				newoptions.y = (yAnchor).toString()

				newoptions.ar = context.lh !== 0 ? calculateAr(context.lw, context.lh)?.string ?? '' : ''

				return newoptions
			},
			callback: async (action) => {
				type Layer = {screenAuxKey: string, layerKey: string, x: number, y: number, w: number, h: number, isPositionable: boolean, [name: string]: number | string | boolean}
				let layers: Layer[]
				if (action.options.screen === 'sel') {
					if (action.options.layersel === 'sel') {
						layers = this.choices.getSelectedLayers() as Layer[]
					} else {
						layers = [{screenAuxKey: action.options.screen, layerKey: action.options.layersel}] as Layer[]
					}
				} else {
					if (action.options[`layer${action.options.screen}`] === 'sel') {
						layers = this.choices.getSelectedLayers().filter(layer => layer.screenAuxKey == action.options.screen) as Layer[]
					} else {
						layers = [{screenAuxKey: action.options.screen, layerKey: action.options[`layer${action.options.screen}`]}] as Layer[]
					}
				}

				const preset = action.options.preset === 'sel' ? this.choices.getPresetSelection('sel') : action.options.preset
				layers = layers.filter(layer => (!this.choices.isLocked(layer.screenAuxKey, preset) && layer.layerKey.match(/^\d+$/))) // wipe out layers of locked screens and native layer
				if (layers.length === 0) return

				const boundingBoxes = getBoundingBox(layers, preset)

				layers = layers.filter(layer => layer.isPositionable)

				const allLayerValues = getAllLayerValues(layers)

				for  (var i = 0; i<layers.length; i += 1) {  // (const layerIndex in layers) {
					const layer: any = layers[i]
					const context = getLayerContext(layer, i+1 , preset, boundingBoxes, allLayerValues )

					if (context === undefined) continue

					let   xAnchor     = parseExpressionString(action.options.xAnchor, context, 0)
					const xPos        = parseExpressionString(action.options.x, context, layer.x)
					let   yAnchor     = parseExpressionString(action.options.yAnchor, context, 0)
					const yPos        = parseExpressionString(action.options.y, context, layer.y)
					const widthInput  = parseExpressionString(action.options.w, context, layer.w)
					const heightInput = parseExpressionString(action.options.h, context, layer.h)

					let ar: number | undefined
					if (action.options.ar.match(/keep/i)) {
						ar = calculateAr(layer.w, layer.h)?.value ?? 0
					} else {
						ar = parseExpressionString(action.options.ar, context, calculateAr(layer.w, layer.h)?.value)
					}

					// adjust position according anchor
					let xDif = xPos - xAnchor
					let yDif = yPos - yAnchor

					if (action.options.parameters.includes('x')) {
						layer.x = layer.xOriginal + xDif
						xAnchor = xPos // after movement the destination is new anchor position
					}
					if (action.options.parameters.includes('y')) {
						layer.y = layer.yOriginal + yDif
						yAnchor = yPos // after movement the destination is new anchor position
					}

					// do resizing
					// first calculate factors
					let xScale = 1, yScale = 1
					if (action.options.parameters.includes('w') && action.options.parameters.includes('h')) {
						// set new width and height
						layer.w = widthInput
						xScale = layer.w / layer.wOriginal
						layer.h = heightInput
						yScale = layer.h / layer.hOriginal
					} else if (action.options.parameters.includes('w')) {
						// set new width by value, height by ar or leave untouched
						layer.w = widthInput
						xScale = layer.w / layer.wOriginal
						if (ar !== undefined && ar !== 0) {
							layer.h = layer.w / ar
							yScale = layer.h / layer.hOriginal
						}
					} else if (action.options.parameters.includes('h')) {
						// set new height by value, width by ar or leave untouched
						layer.h = heightInput
						yScale = layer.h / layer.hOriginal
						if (ar !== undefined && ar !== 0) {
							layer.w = layer.h * ar
							xScale = layer.w / layer.wOriginal
						}
					}
					// now apply scale to coordinates
					xDif = layer.x - xAnchor
					yDif = layer.y - yAnchor

					layer.x = xAnchor + (xDif * xScale)
					layer.y = yAnchor + (yDif * yScale)

					// console.log('layer', {...layer, widthInput, heightInput, xAnchor, yAnchor, ar, context})

					// send values
					const posH = Math.round(layer.x + layer.w / 2)
					if (posH !== Math.round(layer.xOriginal + layer.wOriginal / 2)) {
						this.state.set(['DEVICE', ...layer.path, ...this.constants.propsPositionPath, 'posH'], posH)
						this.connection.sendWSmessage(
							[...layer.path, ...this.constants.propsPositionPath, 'posH'],
							posH
						)
					}
					const posV = Math.round(layer.y + layer.h / 2)
					if (posV !== Math.round(layer.yOriginal + layer.hOriginal / 2)) {
						this.state.set(['DEVICE', ...layer.path, ...this.constants.propsPositionPath, 'posV'], posV)
						this.connection.sendWSmessage(
							[...layer.path,...this.constants.propsPositionPath, 'posV'],
							posV
						)
					}
					if (layer.w !== layer.wOriginal) {
						this.state.set(['DEVICE', ...layer.path, ...this.constants.propsSizePath, 'sizeH'], Math.round(layer.w))
						this.connection.sendWSmessage(
							[...layer.path, ...this.constants.propsSizePath, 'sizeH'],
							Math.round(layer.w)
						)
					}
					if (layer.h !== layer.hOriginal) {
						this.state.set(['DEVICE', ...layer.path, ...this.constants.propsSizePath, 'sizeV'], Math.round(layer.h))
						this.connection.sendWSmessage(
							[...layer.path, ...this.constants.propsSizePath, 'sizeV'],
							Math.round(layer.h)
						)
					}
				}

				this.instance.sendXupdate()
			},
		}

		return devicePositionSize

	}

	/**
	 * MARK: Copy preview from program
	 */
	get deviceCopyProgram() {
		type DeviceCopyProgram = {screens: string}

		const deviceCopyProgram: AWJaction<DeviceCopyProgram> = {
			name: 'LIVE - Copy Program to Preview',
			sortName: '01 LIVE - 13 Copy Program to Preview',
			description: 'Copies the current Program content into Preview for the selected Screen(s)/Auxscreen(s), so a following Take/Cut brings back what is already on air.',
			options: [
				{
					id: 'screens',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screens / Auxscreens',
					choices: [{ id: 'first', label: 'First/Only Selected Screen' }, { id: 'all', label: 'All Screens' }, { id: 'sel', label: 'Selected Screens' }, ...this.choices.getScreenAuxChoices()],
					default: 'sel',
				},
			],
			callback: (action) => {
				const targetScreens = action.options.screens === 'first'
					? this.choices.getSelectedScreens().slice(0, 1)
					: this.choices.getChosenScreenAuxes(action.options.screens)
				for (const screen of targetScreens) {
					if (this.choices.isLocked(screen, 'PREVIEW')) return
					const screeninfo = this.choices.getScreenInfo(screen)
					this.connection.sendWSmessage(
						[
							...(screeninfo.isAux ? this.constants.auxGroupPath : this.constants.screenGroupPath),
							'items', screeninfo.platformId,
							'control', 'pp', 'xCopyProgramToPreview'
						],
						false, 
						true
					)
				}
			},
		}

		return deviceCopyProgram
	}

	// MARK: Set Preset Toggle
	get devicePresetToggle() {
		type DevicePresetToggle = {action: string}
		
		const devicePresetToggle: AWJaction<DevicePresetToggle> = {
			name: 'LIVE - Set Preset Toggle (Program/Preview)',
			sortName: '01 LIVE - 11 Set Preset Toggle (Program/Preview)',
			description: 'Turns Preset Toggle mode on, off, or toggles it (the same setting as WebRCS\'s own Preset Toggle switch).',
			options: [
				{
					type: 'dropdown',
					label: 'Action',
					id: 'action',
					choices: [
						{ id: 'on', label: 'On'},
						{ id: 'off', label: 'Off'},
						{ id: 'toggle', label: 'Toggle'},
					],
					default: 'on',
				},
			],
			callback: () => {}
		}

		return devicePresetToggle
	}

	/**
	 *MARK:  Select Multiviewer Widget
	*/
	get remoteMultiviewerSelectWidget() {
		type RemoteMultiviewerSelectWidget = {widget: string, sel: string}
		
		const remoteMultiviewerSelectWidget: AWJaction<RemoteMultiviewerSelectWidget> = {
			name: 'Multiviewer - Widget Selection',
			sortName: '03 Multiviewer - Widget Selection',
			description: 'Selects, deselects, or toggles selection of a Multiviewer widget, for other Multiviewer actions/feedbacks that target the "selected" widget(s).',
			options: [
				{
					id: 'widget',
					label: 'Widget',
					type: 'dropdown',
					choices: this.choices.getWidgetChoices(),
					default: this.choices.getWidgetChoices()[0]?.id,
				},
				{
					id: 'sel',
					label: 'Action',
					type: 'dropdown',
					choices: [
						{
							id: 'selectExclusive',
							label: 'Select exclusive',
						},
						{
							id: 'deselect',
							label: 'Deselect',
						},
						{
							id: 'select',
							label: 'Select',
						},
						{
							id: 'toggle',
							label: 'Toggle',
						},
					],
					default: 'selectExclusive',
				},
			],
			callback: () => {},
		}

		return remoteMultiviewerSelectWidget
	}

	/**
	 * MARK: Select the source in a multiviewer widget
	 */
	get deviceMultiviewerSource() {
		type DeviceMultiviewerSource = {widget: string, source: string}
		
		const deviceMultiviewerSource: AWJaction<DeviceMultiviewerSource> = {
			name: 'Multiviewer - Select Source in Widget',
			sortName: '03 Multiviewer - Select Source in Widget',
			description: 'Assigns a source to a Multiviewer widget.',
			options: [
				{
					id: 'widget',
					label: 'Widget',
					type: 'dropdown',
					choices: [{ id: 'sel', label: 'Selected' }, ...this.choices.getWidgetChoices()],
					default: 'sel',
				},
				{
					id: 'source',
					label: 'Source',
					type: 'dropdown',
					choices: this.choices.getWidgetSourceChoices(),
					default: this.choices.getWidgetSourceChoices()[0]?.id,
				},
			],
			callback: () => {},
		}

		return deviceMultiviewerSource
	}

	/**
	 * MARK: Select / Deselect screens locally or remote
	 */
	get selectScreen() {
		type SelectScreen = {screen: string, sel: number}
		
		const selectScreen: AWJaction<SelectScreen> = {
			name: 'LIVE - Screen Selection',
			sortName: '01 LIVE - 06 Screen Selection',
			description: 'Selects, deselects, or toggles selection of a Screen/Auxscreen, for other actions/feedbacks that target the "selected" Screen(s). Includes an "Intelligent Press/Release" mode for combining multiple Screens selected by holding several buttons at once on a Stream Deck.',
			options: [
				{
					id: 'screen',
					allowInvalidValues: true,
					label: 'Screen',
					type: 'dropdown',
					choices: this.choices.getScreenAuxChoices(),
					default: this.choices.getScreenAuxChoices()[0]?.id,
				},
				{
					id: 'sel',
					label: 'Action',
					type: 'dropdown',
					tooltip: 'Intelligent PRESS/RELEASE is the Stream Deck multi-finger gesture: put PRESS on a button\'s "down" step and RELEASE on the same button\'s "up" step for every screen-select button you want to combine this way. Press-and-release just one button selects it exclusively; press several before releasing any combines them all. A "session" stays active as long as any of the pressed buttons are still held, and self-heals after 30s if a release is ever missed (e.g. a surface drops mid-press) - "Intelligent reset action" instantly clears that internal state by hand if you don\'t want to wait.',
					choices: [
						{
							id: 0,
							label: 'Deselect',
						},
						{
							id: 1,
							label: 'Select',
						},
						{
							id: 2,
							label: 'Select exclusive',
						},
						{
							id: 3,
							label: 'Toggle',
						},
						{
							id: 4,
							label: 'Intelligent PRESS action',
						},
						{
							id: 5,
							label: 'Intelligent RELEASE action',
						},
						{
							id: 6,
							label: 'Intelligent RESET action (clears stuck multi-select state)',
						},
					],
					default: 2,
				},
			],
			callback: (action) => {
				let sel = action.options.sel
				const surface = action.surfaceId ? action.surfaceId : ''
				const id = surface + action.controlId
				// LOCAL/intelligent/screenSelectionRunning holds {id, timestamp} for every intelligent-select button
				// currently held down (not just the first one pressed) - a multi-select "session" must stay active
				// as long as ANY of them are still held, since with a real multi-finger press the finger that
				// touched down first is not necessarily the one that lifts first. Tracking only a single id (the
				// old approach) ended the session as soon as that specific button released, even while others
				// were still held - the next press would then wrongly do an exclusive select and wipe out the
				// selection instead of adding to it. Confirmed live (2026-08-27) via debug variables: pressing S1
				// then S2, releasing S1 while S2 stayed held, cleared the flag entirely while S2 was still down.
				// The timestamp is a safety net for a release that never arrives (surface dropped mid-press, a
				// button reconfigured while "held", etc.) - entries older than 30s are dropped on the next press,
				// so a stuck state heals itself instead of requiring the user to know about "Intelligent reset".
				const STALE_MS = 30000
				type HeldEntry = { id: string, ts: number }
				const dropStale = (entries: HeldEntry[]): HeldEntry[] => entries.filter(e => Date.now() - e.ts < STALE_MS)
				if (sel === 6 || (sel === 5 && !id.length )) {
					this.state.set('LOCAL/intelligent/screenSelectionRunning', [])
					return
				} else if (sel === 4 && id.length) {
					const running = dropStale(this.state.get('LOCAL/intelligent/screenSelectionRunning') ?? [])
					sel = running.length > 0 ? 3 : 2
					const existing = running.find(e => e.id === id)
					if (existing) existing.ts = Date.now()
					else running.push({ id, ts: Date.now() })
					this.state.set('LOCAL/intelligent/screenSelectionRunning', running)
				} else if (sel === 5 && id.length) {
					const running = dropStale(this.state.get('LOCAL/intelligent/screenSelectionRunning') ?? [])
					const idx = running.findIndex(e => e.id === id)
					if (idx >= 0) running.splice(idx, 1)
					this.state.set('LOCAL/intelligent/screenSelectionRunning', running)
					return
				} else if (sel === 4 && !id.length) {
					sel = 2
				}
				const screeninfo = this.choices.getScreenInfo(action.options.screen)
				if (this.state.syncSelection) {
					switch (sel) {
						case 0:
							this.connection.sendWSdata('REMOTE', 'remove', '/live/screens/screenAuxSelection', [screeninfo.platformLongId])
							break
						case 1:
							this.connection.sendWSdata('REMOTE', 'add', '/live/screens/screenAuxSelection', [screeninfo.platformLongId])
							break
						case 2:
							this.connection.sendWSdata('REMOTE', 'replace', '/live/screens/screenAuxSelection', [[screeninfo.platformLongId]])
							break
						case 3:
							this.connection.sendWSdata('REMOTE', 'toggle', '/live/screens/screenAuxSelection', [screeninfo.platformLongId])
							break
					}
				} else {
					const localSelection = this.state.get('LOCAL/screenAuxSelection/keys') as string[]
					const idx = localSelection.indexOf(screeninfo.id)
					switch (sel) {
						case 0:
							if (idx >= 0) {
								localSelection.splice(idx, 1)
							}
							break
						case 1:
							if (idx === -1) {
								localSelection.push(screeninfo.id)
							}
							break
						case 2:
								this.state.set('LOCAL/screenAuxSelection/keys', [ screeninfo.id ]) 
							break
						case 3:
							if (idx >= 0) {
								localSelection.splice(idx, 1)
							} else {
								localSelection.push(screeninfo.id)
							}
							break
					}
					this.instance.checkFeedbacks('liveScreenSelection')
				}
			},
		}

		return selectScreen
	}

	/**
	 * MARK: lock screens
	 */
	get lockScreen() {
		type LockScreen = {screens: string, preset: string, lock: string}

		const lockScreen: AWJaction<LockScreen> = {
			name: 'LIVE - Lock Screen(s)',
			sortName: '01 LIVE - 16 Lock Screen(s)',
			description: 'Locks, unlocks, or toggles the lock state of the Program or Preview side of one or more Screens/Auxscreens - a locked side rejects changes (Take, memory recalls, layer edits) until unlocked.',
			options: [
				{

					id: 'screens',
					allowInvalidValues: true,
					label: 'Screen',
					type: 'dropdown',
					choices: [{ id: 'first', label: 'First/Only Selected Screen' }, { id: 'all', label: 'All Screens' }, { id: 'sel', label: 'All Selected Screens' }, ...this.choices.getScreenAuxChoices()],
					default: 'all',
					tooltip:
						'If you choose "All" and "Toggle", the behavior is exactly like in WebRCS, if you choose multiple screens they will be toggled individually',
				},
				{
					id: 'preset',
					label: 'Preset (Program/Preview)',
					type: 'dropdown',
					choices: [
						{ id: 'PROGRAM', label: 'Program' },
						{ id: 'PREVIEW', label: 'Preview' },
					],
					default: 'PROGRAM',
				},
				{
					id: 'lock',
					label: 'Action',
					type: 'dropdown',
					choices: [
						{
							id: 'unlock',
							label: 'Unlock',
						},
						{
							id: 'lock',
							label: 'Lock',
						},
						{
							id: 'toggle',
							label: 'Toggle',
						},
					],
					default: 'toggle',
				},
			],
			callback: (action) => {
				const screensOption = action.options.screens
				const isAll = screensOption === 'all'
				const resolvedScreens = screensOption === 'first'
					? this.choices.getSelectedScreens().slice(0, 1)
					: this.choices.getChosenScreenAuxes(screensOption)
				const pst = action.options.preset === 'PREVIEW' ? 'Prw' : 'Pgm'
				if (this.state.syncSelection) {
					if (action.options.lock === 'lock' || action.options.lock === 'unlock') {
						const scrs = resolvedScreens
							.map( screenId => this.choices.getScreenInfo(screenId).platformLongId )
						this.connection.sendWSdata(
							'REMOTE',
							action.options.lock + 'ScreenAuxes' + pst,
							'/live/screens/presetModeLock',
							[scrs]
						)
					} else if (action.options.lock === 'toggle') {
						if (isAll) {
							const allscreens = resolvedScreens
								.map(scr => this.choices.getScreenInfo(scr).platformLongId)
							const allLocked =
								allscreens.find((scr) => {
									return this.state.get(['REMOTE', 'live', 'screens', 'presetModeLock', action.options.preset, scr]) === false
								}) === undefined
							let lock = 'lock'
							if (allLocked) {
								lock = 'unlock'
							}
							this.connection.sendWSdata(
								'REMOTE',
								lock + 'ScreenAuxes' + pst,
								'/live/screens/presetModeLock',
								[allscreens]
							)
						} else {
							for (const screen of resolvedScreens) {
								this.connection.sendWSdata(
									'REMOTE',
									'toggle',
									'/live/screens/presetModeLock/' + action.options.preset,
									[this.choices.getScreenInfo(screen).platformLongId]
								)
							}
						}
					}
				} else {
					const localLocks = this.state.get(['LOCAL', 'presetModeLock', action.options.preset])
					if (action.options.lock === 'lock') {
						for (const screen of resolvedScreens) {
							localLocks[screen] = true
						}
					} else if (action.options.lock === 'unlock') {
						for (const screen of resolvedScreens) {
							localLocks[screen] = false
						}
					} else if (action.options.lock === 'toggle') {
						if (isAll) {
							const allscreens = resolvedScreens
							const allLocked =
								allscreens.find((scr) => {
									return this.state.get(['LOCAL', 'presetModeLock', action.options.preset, scr]) === false
								}) === undefined
							if (allLocked) {
								for (const screen of allscreens) {
									localLocks[screen] = false
								}
							} else {
								for (const screen of allscreens) {
									localLocks[screen] = true
								}
							}
						} else {
							for (const screen of resolvedScreens) {
								localLocks[screen] = localLocks[screen] === true ? false : true
							}
						}
					}
					this.instance.checkFeedbacks('liveScreenLock')
				}
			},
		}

		return lockScreen
	}

	/**
	 * MARK: Select Preset locally or remote
	 */
	get selectPreset() {
		type SelectPreset = {mode: string}
		
		const selectPreset: AWJaction<SelectPreset> = {
			name: 'LIVE - Select Preset (Program/Preview)',
			sortName: '01 LIVE - 10 Select Preset (Program/Preview)',
			description: 'Selects which side (Program or Preview) is currently active for editing/targeting, or toggles between them.',
			options: [
				{
					id: 'mode',
					label: 'Preset',
					type: 'dropdown',
					choices: [
						{ id: 'pgm', label: 'Program' },
						{ id: 'prw', label: 'Preview' },
						{ id: 'tgl', label: 'Toggle' },
					],
					allowInvalidValues: true,
					default: 'tgl',
				},
			],
			callback: (action) => {
				if (this.state.syncSelection) {
					switch (action.options.mode) {
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
					switch (action.options.mode) {
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
				this.instance.checkFeedbacks('liveScreenSelection', 'remoteLayerSelection')
			},
		}

		return selectPreset
	}

	/**
	 * MARK: Select Layer locally or remote
	 */
	get selectLayer() {
		type SelectLayer = {method: string, screen: string[], layersel: string[]}
		
		const selectLayer: AWJaction<SelectLayer> = {
			name: 'LIVE - Layer Selection',
			sortName: '01 LIVE - 07 Layer Selection',
			description: 'Selects (or toggles) which Layer(s) are currently selected, for other actions/feedbacks that target the "selected" Layer(s). Does not change which Preset is active.',
					options: [
				{
					id: 'method',
					type: 'dropdown',
					label: 'Method',
					choices: [
						{ id: 'spec', label: 'Select layers of specified screens' },
						{ id: 'sel', label: 'Select layers of selected screens and preset' },
						{ id: 'spectgl', label: 'Toggle layers of specified screens' },
						{ id: 'seltgl', label: 'Toggle layers of selected screens and preset' },
					],
					default: 'spec',
					disableAutoExpression: true,
				},
				{
					id: 'screen',
					allowInvalidValues: true,
					type: 'multidropdown',
					label: 'Screen / Aux',
					choices: this.choices.getScreenAuxChoices(),
					default: [this.choices.getScreenAuxChoices()[0]?.id],
					isVisibleExpression: "indexOf($(options:method), 'spec') == 0",
					disableAutoExpression: true,
				},
				{
					id: `layersel`,
					type: 'multidropdown',
					label: 'Layer',
					tooltip:
						'Choose all the layers you want to be selected, every other layer on any screen will be deselected. This action does not change the preset, if you want a specific preset, add the according action.',
					choices: this.choices.getLayerChoices(48, true),
					default: ['1'],
					isVisibleExpression: "indexOf($(options:method), 'sel') == 0",
				},
			],
			callback: (action) => {
				let ret: Record<'screenAuxKey' | 'layerKey', string>[] = []
				if (action.options.method?.endsWith('tgl')) {
					if (this.state.syncSelection) {
						ret = this.state.get('REMOTE/live/screens/layerSelection/layerIds')
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
							ret.push({ screenAuxKey: screen, layerKey: layer })
						}
					}
				}
				if (this.state.syncSelection) {
					this.connection.sendWSdata('REMOTE', 'replace', '/live/screens/layerSelection', [ret])
				} else {
					this.state.set('LOCAL/layerIds', ret)
					this.instance.checkFeedbacks('remoteLayerSelection')
				}
			},
		}
		for (const screen of this.screens) {
			const layerChoices = this.choices.getLayerChoices(screen.id, true)
			let defaultChoice: string | number
			if (layerChoices.find((choice: DropdownChoice) => choice.id === '1')) defaultChoice = '1'
			else defaultChoice = layerChoices[0]?.id ?? '1'

			selectLayer.options.push({
				id: `layer${screen.id}`,
				type: 'multidropdown',
				label: 'Layer ' + screen.id,
				choices: layerChoices,
				default: [defaultChoice],
				isVisibleExpression: `indexOf($(options:method), 'spec') == 0 && arrayIncludes($(options:screen), '${screen.id}')`,
			})
		}

		return selectLayer
	}

	/**
	 * MARK: Switch selection syncronization with device on/off
	 */
	get remoteSync() {
		type RemoteSync = {sync: number}
		
		const remoteSync: AWJaction<RemoteSync> = {
			name: 'Device - Sync Selection',
			sortName: '09 Device - Sync Selection',
			description: 'Turns on/off/toggles whether this Companion connection\'s Screen/Layer selection is synchronized with WebRCS and other connected clients (the same "Sync" setting shown in WebRCS).',
			options: [
				{
					label: 'Sync',
					type: 'dropdown',
					id: 'sync',
					choices: [
						{ id: 1, label: 'turn sync on' },
						{ id: 0, label: 'turn sync off' },
						{ id: 2, label: 'toggle sync' },
					],
					default: 2,
				},
			],
			callback: (action) => {
				const clients: {id: string}[] = this.state.get('REMOTE/system/network/websocketServer/clients') // TODO: handle secure connections
				let syncstate: boolean
				const myid: string = this.state.get('LOCAL/socketId')
				const myindex = clients.findIndex((elem) => {
					if (elem.id === myid) {
						return true
					} else {
						return false
					}
				})
				switch (action.options.sync) {
					case 0:
						syncstate = false
						break
					case 1:
						syncstate = true
						break
					case 2:
						if (this.state.get(`REMOTE/system/network/websocketServer/clients/${myindex}/isRemoteSelectionEnabled`)) {
							syncstate = false
						} else {
							syncstate = true
						}
						break
					default:
						syncstate = false
						break
				}
				this.state.set('LOCAL/syncSelection', syncstate)
				this.connection.sendRawWSmessage(
					`{"channel":"REMOTE","data":{"name":"enableRemoteSelection","path":"/system/network/websocketServer/clients/${myindex}","args":[${syncstate}]}}`
				)
				this.instance.checkFeedbacks(
					'livePresetSelection',
					'liveScreenSelection',
					'remoteLayerSelection',
					'liveScreenLock',
					'remoteWidgetSelection'
				)
				
				let preset: string,
					vartext = 'PGM'
				if (syncstate) {
					preset = this.state.get('REMOTE/live/screens/presetModeSelection/presetMode')
				} else {
					preset = this.state.get('LOCAL/presetMode')
				}
				if (preset === 'PREVIEW') {
					vartext = this.config.useOldVariableNames ? 'PVW' : 'PRW'
				}
				this.instance.setVariableValues({ selectedPreset: vartext })

			},
		}

		return remoteSync
	}

	// MARK: Stream Control - Midra
	get deviceStreamControl() {
		type DeviceStreamControl = {stream: string}
		
		const deviceStreamControl: AWJaction<DeviceStreamControl> = {
			name: 'LIVE - Stream Control',
			sortName: '01 LIVE - 15 Stream Control',
			description: 'Starts, stops, or toggles the device\'s streaming output (Midra only).',
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
					this.connection.sendWSmessage('device/streaming/control/pp/start', true)				
				}
				if (action === 'off') {
					this.connection.sendWSmessage('device/streaming/control/pp/start', false)				
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
			sortName: '07 Audio - Mute Stream',
			description: 'Mutes, unmutes, or toggles the audio of the device\'s streaming output (Midra only).',
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
				if (action === 'on') this.connection.sendWSmessage('device/streaming/control/audio/live/pp/mute', false)
				if (action === 'off') this.connection.sendWSmessage('device/streaming/control/audio/live/pp/mute', true)
			}
		}

		return deviceStreamAudioMute
	}

	/**
	 * MARK: Route audio block
	 */
	get deviceAudioRouteBlock() {
		type DeviceAudioRouteBlock = {device: number, out1: string, in1: string, out2?: string, in2?: string, out3?: string, in3?: string, out4?: string, in4?: string, blocksize: number}

		const deviceAudioRouteBlock: AWJaction<DeviceAudioRouteBlock> = {
			name: 'Audio - Route (Block)',
			sortName: '07 Audio - Route (Block)',
			description: 'Routes a contiguous block of audio input channels to a contiguous block of output channels in one step.',
			options: [
				// TODO(isVisible-migration): build-time-only visibility (based on number of linked devices at field-construction time, not a live option); field is only included when there is more than one linked device
				...(this.choices.getLinkedDevicesChoices().length > 1 ? [{
					type: 'dropdown' as const,
					label: 'Device',
					id: 'device',
					choices: this.choices.getLinkedDevicesChoices(),
					default: '1',
					minChoicesForSearch: 3,
				}] : []),
				{
					type: 'dropdown',
					label: 'First Output Channel',
					id: 'out1',
					choices: this.choices.getAudioOutputChoices(),
					default: this.choices.getAudioOutputChoices()[0]?.id,
					minChoicesForSearch: 0,
				},
				{
					type: 'dropdown',
					label: 'First Input Channel',
					id: 'in1',
					choices: this.choices.getAudioInputChoices(),
					default: 'NONE',
					minChoicesForSearch: 0,
					tooltip: 'If you choose "No Source" the whole Block will be unrouted',
				},
				{
					type: 'number',
					label: 'Block Size',
					id: 'blocksize',
					default: 8,
					min: 1,
					max: this.choices.getAudioInputChoices().length,
					range: true,
				},
			],
		}
		
		return deviceAudioRouteBlock
	}

	/**
	 * MARK: Route audio channels
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
				// TODO(isVisible-migration): build-time-only visibility (based on number of linked devices at field-construction time, not a live option); field is only included when there is more than one linked device
				...(this.choices.getLinkedDevicesChoices().length > 1 ? [{
					type: 'dropdown' as const,
					label: 'Device',
					id: 'device',
					choices: this.choices.getLinkedDevicesChoices(),
					default: 1,
					minChoicesForSearch: 3,
				}] : []),
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
		}

		return deviceAudioRouteChannels
	}

	/**
	 * MARK: Setup timer
	 */
	get deviceTimerSetup() {
		type DeviceTimerSetup = {timer: string, type: string, currentTimeMode: string, unitMode: string, fg_color: number, bg_color: number}
		
		const deviceTimerSetup: AWJaction<DeviceTimerSetup> = {
			name: 'Timers - Setup',
			description: 'Configures a Timer\'s display appearance (type, unit, colors) as an on-screen widget. To start/stop/adjust the Timer\'s value, use "Timers - Transport"/"Timers - Adjust Time" instead.',
			sortName: '05 Timers - Setup',
			options: [
				{
					id: 'timer',
					type: 'dropdown',
					label: 'Timer',
					choices: this.choices.getTimerChoices(),
					default: this.choices.getTimerChoices()[0]?.id,
				},
				{
					id: 'type',
					type: 'dropdown',
					label: 'Timer Type',
					choices: [
						{ id: 'CURRENTTIME', label: 'Current time' },
						{ id: 'COUNTDOWN', label: 'Count down' },
						{ id: 'STOPWATCH', label: 'Count up' },
					],
					default: 'COUNTDOWN',
					disableAutoExpression: true,
				},
				{
					id: 'currentTimeMode',
					type: 'dropdown',
					label: 'Time Display',
					choices: [
						{ id: '24H', label: '24 hours' },
						{ id: '12H_AM_PM', label: '12 hours' },
					],
					default: '24H',
					isVisibleExpression: "$(options:type) == 'CURRENTTIME'",
				},
				{
					id: 'unitMode',
					type: 'dropdown',
					label: 'Time Display',
					choices: [
						{ id: 'IN_SECONDS', label: 'In seconds' },
						{ id: 'IN_MINUTES', label: 'In minutes' },
						{ id: 'IN_HOURS', label: 'In hours' },
					],
					default: 'IN_MINUTES',
					isVisibleExpression: "$(options:type) != 'CURRENTTIME'",
				},
				{
					id: 'fg_color',
					type: 'colorpicker',
					enableAlpha: true,
					returnType: 'string',
					label: 'Text color',
					default: `rgba(${splitRgb(this.config.color_bright).r},${splitRgb(this.config.color_bright).g},${splitRgb(this.config.color_bright).b},1)`,
				},
				{
					id: 'bg_color',
					type: 'colorpicker',
					enableAlpha: true,
					returnType: 'string',
					label: 'Background color',
					default: `rgba(${splitRgb(this.config.color_dark).r},${splitRgb(this.config.color_dark).g},${splitRgb(this.config.color_dark).b},0.7)`,
				},
			],
			callback: () => {},
		}

		return deviceTimerSetup
	}

	/**
	 * MARK: Adjust timer
	 */
	get deviceTimerAdjust() {
		type DeviceTimerAdjust = {timer: string, action: string, time: string}
		
		const deviceTimerAdjust: AWJaction<DeviceTimerAdjust> = {
			name: 'Timers - Adjust Time',
			sortName: '05 Timers - Adjust Time',
			description: 'Sets, adds to, or subtracts from a Timer\'s current value.',
			options: [
				{
					id: 'timer',
					type: 'dropdown',
					label: 'Timer',
					choices: this.choices.getTimerChoices(),
					default: this.choices.getTimerChoices()[0]?.id,
				},
				{
					id: 'action',
					type: 'dropdown',
					label: 'Action',
					choices: [
						{ id: 'set', label: 'Set Time' },
						{ id: 'add', label: 'Add Time' },
						{ id: 'sub', label: 'Subtract Time' },
					],
					default: 'set',
				},
				{
					id: 'time',
					type: 'textinput',
					label: 'Time',
					default: '',
					useVariables: true,
				},
			],
			callback: async (action) => {
				let timetype = 'countdownDuration'
				const type = this.state.get(['DEVICE', 'device', 'timerList', 'items', action.options.timer, 'control', 'pp', 'type'])
				if (type === 'CURRENTTIME') {
					timetype = 'timeOffset'
				}
				let time = this.state.get(['DEVICE', 'device', 'timerList', 'items', action.options.timer, 'control', 'pp', timetype])
				const inputvalue = action.options.time
				if (action.options.action === 'add') {
					time += timeToSeconds(inputvalue)
				} else if (action.options.action === 'sub') {
					time -= timeToSeconds(inputvalue)
				} else if (action.options.action === 'set') {
					time = timeToSeconds(inputvalue)
				} else {
					time = 0
				}
				this.connection.sendWSmessage(
					['device', 'timerList', 'items', action.options.timer, 'control', 'pp', timetype],
					time
				)
			},
		}

		return deviceTimerAdjust
	}

	/**
	 * MARK: Play timer
	 */
	get deviceTimerTransport() {
		type DeviceTimerTransport = {timer: string, cmd: string}
		
		const deviceTimerTransport: AWJaction<DeviceTimerTransport> = {
			name: 'Timers - Transport',
			sortName: '05 Timers - Transport',
			description: 'Starts, stops, pauses, or toggles a Timer.',
			options: [
				{
					id: 'timer',
					type: 'dropdown',
					label: 'Timer',
					choices: this.choices.getTimerChoices(),
					default: this.choices.getTimerChoices()[0]?.id,
				},
				{
					id: 'cmd',
					type: 'dropdown',
					label: 'Command',
					choices: [
						{ id: 'start', label: 'Start' },
						{ id: 'stop', label: 'Stop' },
						{ id: 'pause', label: 'Pause' },
						{ id: 'tgl_start_pause', label: 'Toggle Start/Pause' },
						{ id: 'tgl_start_stop', label: 'Toggle Start/Stop' },
					],
					default: 'start',
				},
			],
			callback: (action) => {
				let cmd = 'xPause'
				if (action.options.cmd === 'start') {
					cmd = 'xStart'
				} else if (action.options.cmd === 'stop') {
					cmd = 'xStop'
				} else if (action.options.cmd === 'pause') {
					cmd = 'xPause'
				} else if (action.options.cmd === 'tgl_start_pause') {
					const timerstate = this.state.get([
						'DEVICE',
						'device',
						'timerList',
						'items',
						action.options.timer,
						'status',
						'pp',
						'state',
					])
					if (timerstate === 'RUNNING') {
						cmd = 'xPause'
					} else {
						cmd = 'xStart'
					}
				} else if (action.options.cmd === 'tgl_start_stop') {
					const timerstate = this.state.get([
						'DEVICE',
						'device',
						'timerList',
						'items',
						action.options.timer,
						'status',
						'pp',
						'state',
					])
					if (timerstate === 'RUNNING' || timerstate === 'ELAPSED') {
						cmd = 'xStop'
					} else {
						cmd = 'xStart'
					}
				}
				this.connection.sendWSmessage(['device', 'timerList', 'items', action.options.timer, 'control', 'pp', cmd], false, true)
			},
		}

		return deviceTimerTransport
	}

	/**
	 * MARK: Choose Testpatterns
	 */
	deviceTestpatterns_common(deviceTestpatternsOptions: CompanionInputFieldDropdown[], name = 'Device - Set Testpattern') {
		type DeviceTestpatterns = {group: string, screenList: string, outputList: string, patall: string, screenListPat: string, outputListPat: string, inputList?: string, inputListPat?: string, area?: string, rawColors?: boolean, outputListColor?: number | string, outputListGridBackColor?: string, outputListGridThickness?: number, outputListGridSizeH?: number, outputListGridSizeV?: number, outputListGridShowIds?: boolean, outputListCrossSizeH?: number, outputListCrossSizeV?: number, outputListCheckerSizeH?: number, outputListCheckerSizeV?: number, outputListCheckerInvert?: boolean}

		// Area/Raw Colors/Color only exist on the outputList group's pattern model (live-confirmed on a real
		// Aquilon, LivePremier platform fw 6.2.73: device/outputList/items/{id}/pattern/control/pp/{fitArea,
		// disableColorimetry} and .../pattern/color/pp/{red,green,blue}) - identical across platforms, so built
		// once here rather than duplicated per platform like the pattern-type choice lists.
		const outputExtraOptions: SomeCompanionActionInputField[] = [
			{
				id: 'area',
				type: 'dropdown',
				label: 'Area',
				choices: [
					{ id: 'FORMAT', label: 'Format' },
					{ id: 'AOI', label: 'AOI' },
				],
				default: 'FORMAT',
				isVisibleExpression: "$(options:group) == 'outputList'",
			},
			{
				id: 'rawColors',
				type: 'checkbox',
				label: 'Raw Colors',
				default: false,
				isVisibleExpression: "$(options:group) == 'outputList'",
			},
			{
				id: 'outputListColor',
				type: 'colorpicker',
				label: 'Color',
				default: 0xffffff,
				isVisibleExpression: "$(options:group) == 'outputList' && $(options:outputListPat) == 'COLOR'",
			},
			// Grid Custom-only: device/outputList/items/{id}/pattern/grid/pp/{backColor,thickness,sizeH,sizeV,id}.
			// backColor is a PATTERN_BACK_COLOR enum (Black/White/Red/Green/Blue), not a free RGB value like the
			// Solid Color field above - confirmed via WebRCS's own bundled enum definitions.
			{
				id: 'outputListGridBackColor',
				type: 'dropdown',
				label: 'Background Color',
				choices: [
					{ id: 'BLACK', label: 'Black' },
					{ id: 'WHITE', label: 'White' },
					{ id: 'RED', label: 'Red' },
					{ id: 'GREEN', label: 'Green' },
					{ id: 'BLUE', label: 'Blue' },
				],
				default: 'BLACK',
				isVisibleExpression: "$(options:group) == 'outputList' && $(options:outputListPat) == 'GRID_CUSTOM'",
			},
			{
				id: 'outputListGridThickness',
				type: 'number',
				label: 'Thickness',
				min: 0,
				max: 16,
				default: 1,
				isVisibleExpression: "$(options:group) == 'outputList' && $(options:outputListPat) == 'GRID_CUSTOM'",
			},
			{
				id: 'outputListGridSizeH',
				type: 'number',
				label: 'H Size',
				min: 32,
				max: 4096,
				default: 64,
				isVisibleExpression: "$(options:group) == 'outputList' && $(options:outputListPat) == 'GRID_CUSTOM'",
			},
			{
				id: 'outputListGridSizeV',
				type: 'number',
				label: 'V Size',
				min: 16,
				max: 4096,
				default: 64,
				isVisibleExpression: "$(options:group) == 'outputList' && $(options:outputListPat) == 'GRID_CUSTOM'",
			},
			{
				id: 'outputListGridShowIds',
				type: 'checkbox',
				label: 'Show IDs',
				default: false,
				isVisibleExpression: "$(options:group) == 'outputList' && $(options:outputListPat) == 'GRID_CUSTOM'",
			},
			// Crosshatch-only: device/outputList/items/{id}/pattern/cross/pp/{sizeH,sizeV}
			{
				id: 'outputListCrossSizeH',
				type: 'number',
				label: 'H Size',
				min: 32,
				max: 4096,
				default: 256,
				isVisibleExpression: "$(options:group) == 'outputList' && $(options:outputListPat) == 'CROSSHATCH'",
			},
			{
				id: 'outputListCrossSizeV',
				type: 'number',
				label: 'V Size',
				min: 32,
				max: 2160,
				default: 256,
				isVisibleExpression: "$(options:group) == 'outputList' && $(options:outputListPat) == 'CROSSHATCH'",
			},
			// Checkerboard-only: device/outputList/items/{id}/pattern/checker/pp/{sizeH,sizeV}
			{
				id: 'outputListCheckerSizeH',
				type: 'number',
				label: 'H Size',
				min: 1,
				max: 4096,
				default: 16,
				isVisibleExpression: "$(options:group) == 'outputList' && $(options:outputListPat) == 'CHECKERBOARD'",
			},
			{
				id: 'outputListCheckerSizeV',
				type: 'number',
				label: 'V Size',
				min: 1,
				max: 2160,
				default: 16,
				isVisibleExpression: "$(options:group) == 'outputList' && $(options:outputListPat) == 'CHECKERBOARD'",
			},
			{
				id: 'outputListCheckerInvert',
				type: 'checkbox',
				label: 'Invert Color',
				default: false,
				isVisibleExpression: "$(options:group) == 'outputList' && $(options:outputListPat) == 'CHECKERBOARD'",
			},
		]

		const deviceTestpatterns: AWJaction<DeviceTestpatterns> = {
			name,
			sortName: `09 ${name}`,
			description: 'Turns a Testpattern on or off (or "Inhibit"s it) for a Screen Canvas, Output, or Input Group.',
			options: [...deviceTestpatternsOptions, ...outputExtraOptions],
			callback: (action) => {
				if (action.options.group === 'all') {
					const idx = deviceTestpatternsOptions.findIndex((option) => {
						return option?.id === 'group'
					})
					deviceTestpatternsOptions[idx].choices
					.filter((choice) => { return choice.id !== 'all' })
					.forEach((group) => {
						deviceTestpatternsOptions.find((option) => option.id === group.id)?.choices
						.forEach((choice) => {
							this.connection.sendWSmessage(['device', group.id.toString(), 'items', choice.id.toString(), 'pattern', 'control', 'pp', 'inhibit'], true)
							this.connection.sendWSmessage(['device', group.id.toString(), 'items', choice.id.toString(), 'pattern', 'control', 'pp', 'type'],
								deviceTestpatternsOptions.find((option) => option.id === group.id + 'Pat')?.choices[0]?.id ?? ''
							)
						} )
					})

					// "Disable all active Testpatterns" should also clear the Raster Box overlay (Format/AOI
					// centering markers) on every output - it belongs conceptually to "testpatterns off", and is
					// easy to leave on by accident before a show since it's barely visible on its own. Raster Box
					// only exists as a built action on platforms with "deviceTestpatternRasterBox" (LivePremier/
					// LivePremier4 - device/outputList/items/{id}/pattern/control/pp/centering); Midra models the
					// same concept differently (two separate booleans) and has no Raster Box action yet, so this
					// deliberately does not touch Midra.
					if (this.actionsToUse.includes('deviceTestpatternRasterBox')) {
						for (const output of this.choices.getOutputChoices()) {
							this.connection.sendWSmessage(['device', 'outputList', 'items', output.id.toString(), 'pattern', 'control', 'pp', 'centering'], [])
						}
					}
				} else {
					this.connection.sendWSmessage(
						[
							'device',
							action.options.group,
							'items',
							action.options[action.options.group],
							'pattern',
							'control',
							'pp',
							'type',
						],
						action.options[`${action.options.group}Pat`]
					)
					const inhibit =
						action.options[`${action.options.group}Pat`] === 'NONE' ||
						action.options[`${action.options.group}Pat`] === 'NO_PATTERN'
							? true
							: false
					this.connection.sendWSmessage(
						[
							'device',
							action.options.group,
							'items',
							action.options[action.options.group],
							'pattern',
							'control',
							'pp',
							'inhibit',
						],
						inhibit
					)

					// Area/Raw Colors/Color only exist on the outputList group's pattern model - live-confirmed
					// on a real Aquilon (LivePremier platform, fw 6.2.73): device/outputList/items/{id}/pattern/
					// control/pp/{fitArea,disableColorimetry} and .../pattern/color/pp/{red,green,blue}. Color
					// is only meaningful for the "COLOR" (Solid Color) pattern, but harmless to always send.
					if (action.options.group === 'outputList') {
						const outputPath = ['device', 'outputList', 'items', action.options.outputList, 'pattern']
						if (action.options.area !== undefined) {
							this.connection.sendWSmessage([...outputPath, 'control', 'pp', 'fitArea'], action.options.area)
						}
						if (action.options.rawColors !== undefined) {
							this.connection.sendWSmessage([...outputPath, 'control', 'pp', 'disableColorimetry'], parseBoolean(action.options.rawColors))
						}
						if (action.options.outputListPat === 'COLOR' && action.options.outputListColor !== undefined) {
							const color = Number(action.options.outputListColor)
							this.connection.sendWSmessage([...outputPath, 'color', 'pp', 'red'], (color >> 16) & 0xff)
							this.connection.sendWSmessage([...outputPath, 'color', 'pp', 'green'], (color >> 8) & 0xff)
							this.connection.sendWSmessage([...outputPath, 'color', 'pp', 'blue'], color & 0xff)
						}
						if (action.options.outputListPat === 'GRID_CUSTOM') {
							if (action.options.outputListGridBackColor !== undefined) this.connection.sendWSmessage([...outputPath, 'grid', 'pp', 'backColor'], action.options.outputListGridBackColor)
							if (action.options.outputListGridThickness !== undefined) this.connection.sendWSmessage([...outputPath, 'grid', 'pp', 'thickness'], action.options.outputListGridThickness)
							if (action.options.outputListGridSizeH !== undefined) this.connection.sendWSmessage([...outputPath, 'grid', 'pp', 'sizeH'], action.options.outputListGridSizeH)
							if (action.options.outputListGridSizeV !== undefined) this.connection.sendWSmessage([...outputPath, 'grid', 'pp', 'sizeV'], action.options.outputListGridSizeV)
							if (action.options.outputListGridShowIds !== undefined) this.connection.sendWSmessage([...outputPath, 'grid', 'pp', 'id'], parseBoolean(action.options.outputListGridShowIds))
						}
						if (action.options.outputListPat === 'CROSSHATCH') {
							if (action.options.outputListCrossSizeH !== undefined) this.connection.sendWSmessage([...outputPath, 'cross', 'pp', 'sizeH'], action.options.outputListCrossSizeH)
							if (action.options.outputListCrossSizeV !== undefined) this.connection.sendWSmessage([...outputPath, 'cross', 'pp', 'sizeV'], action.options.outputListCrossSizeV)
						}
						if (action.options.outputListPat === 'CHECKERBOARD') {
							if (action.options.outputListCheckerSizeH !== undefined) this.connection.sendWSmessage([...outputPath, 'checker', 'pp', 'sizeH'], action.options.outputListCheckerSizeH)
							if (action.options.outputListCheckerSizeV !== undefined) this.connection.sendWSmessage([...outputPath, 'checker', 'pp', 'sizeV'], action.options.outputListCheckerSizeV)
							if (action.options.outputListCheckerInvert !== undefined) this.connection.sendWSmessage([...outputPath, 'checker', 'pp', 'invert'], parseBoolean(action.options.outputListCheckerInvert))
						}
					}
				}
			},
		}

		return deviceTestpatterns
	}

	/**
	 * MARK: Testpattern Raster Box (shared)
	 * Live-confirmed on a real Aquilon (RS6, fw 6.2.73, "LivePremier" platform): an output's Raster Box overlay
	 * (alignment/centering markers for the Format border and/or the AOI border) is independent of whether a
	 * Testpattern itself is enabled - device/outputList/items/{id}/pattern/control/pp/centering, an array that
	 * can hold "FORMAT", "AOI", both, or be empty. Only confirmed on Output (Screen Canvas patterns have no such
	 * field at all - live-checked, just {inhibit, type}). Not yet checked on Midra, which has the same underlying
	 * concept but modeled as two separate booleans (formatCentering/aoiCentering) instead of one array.
	 */
	deviceTestpatternRasterBox_common(name: string) {
		type DeviceTestpatternRasterBox = {output: string, rasterBox: string[], mode: string}

		const deviceTestpatternRasterBox: AWJaction<DeviceTestpatternRasterBox> = {
			name,
			sortName: `09 ${name}`,
			description: 'Turns a Raster Box (Format/AOI markers) on or off for an Output.',
			options: [
				{
					id: 'output',
					type: 'dropdown',
					label: 'Output or Output Group',
					choices: this.choices.getOutputChoices(),
					default: this.choices.getOutputChoices()[0]?.id,
				},
				{
					id: 'rasterBox',
					type: 'multidropdown',
					label: 'Raster Box',
					choices: [
						{ id: 'FORMAT', label: 'Format' },
						{ id: 'AOI', label: 'AOI' },
					],
					default: [],
					minSelection: 0,
				},
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Mode',
					choices: [
						{ id: 'enable', label: 'Enable' },
						{ id: 'disable', label: 'Disable' },
						{ id: 'toggle', label: 'Toggle' },
					],
					default: 'enable',
				},
			],
			callback: (action) => {
				const path = ['device', 'outputList', 'items', action.options.output, 'pattern', 'control', 'pp', 'centering']
				const current: string[] = this.state.get(['DEVICE', ...path]) ?? []
				const result = new Set(current)
				for (const box of action.options.rasterBox) {
					if (action.options.mode === 'enable') result.add(box)
					else if (action.options.mode === 'disable') result.delete(box)
					else if (result.has(box)) result.delete(box)
					else result.add(box)
				}
				this.connection.sendWSmessage(path, Array.from(result))
			},
		}

		return deviceTestpatternRasterBox
	}

	/**
	 * MARK: Choose Testpatterns
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
				choices: this.choices.getScreenAuxChoices(),
				default: this.choices.getScreenAuxChoices()[0]?.id,
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
				],
				default: 'NO_PATTERN',
				isVisibleExpression: "$(options:group) == 'outputList'",
				disableAutoExpression: true,
			},
		]

		return this.deviceTestpatterns_common(deviceTestpatternsOptions)

	}


	/**
	 * MARK: Send custom AWJ replace command
	 */
	get cstawjcmd() {
		type Cstawjcmd = {path: string, valuetype: string, textValue: string, numericValue: number, booleanValue: boolean, objectValue: string, xUpdate: boolean}
		
		const cstawjcmd: AWJaction<Cstawjcmd> = {
			name: 'Custom Commands - Send custom AWJ replace command',
			sortName: '11 Custom Commands - Send custom AWJ replace command',
			description:
				'Sends a command directly to the device using its own internal protocol - for advanced setups that the built-in actions don\'t cover. Nothing you enter here is checked, so a typo in Path or Value simply does nothing (or the wrong thing) without any warning. Tip: the T-Bar side ("A"/"B") swaps between Program and Preview with every Take - if you want your command to always affect whichever side is currently Program or Preview instead of a fixed side, type "PGM" or "PRW" (the earlier "PVW" still works too) in the Path instead of "A"/"B".',
			options: [
				{
					type: 'textinput',
					id: 'path',
					label: 'path',
					useVariables: true,
				},
				{
					type: 'dropdown',
					id: 'valuetype',
					label: 'value is of type',
					choices: [
						{ id: '1', label: 'Text' },
						{ id: '2', label: 'Number' },
						{ id: '3', label: 'Boolean' },
						{ id: '4', label: 'Object' },
					],
					default: '1',
					disableAutoExpression: true,
				},
				{
					type: 'textinput',
					id: 'textValue',
					label: 'value',
					useVariables: true,
					isVisibleExpression: "$(options:valuetype) == '1'",
				},
				{
					type: 'number',
					id: 'numericValue',
					label: 'value',
					isVisibleExpression: "$(options:valuetype) == '2'",
					default: 0,
					min: -32768,
					max: 32768,
				},
				{
					type: 'checkbox',
					id: 'booleanValue',
					label: 'value',
					isVisibleExpression: "$(options:valuetype) == '3'",
					default: false
				},
				{
					type: 'textinput',
					id: 'objectValue',
					label: 'value',
					useVariables: true,
					isVisibleExpression: "$(options:valuetype) == '4'",
				},
				{
					type: 'checkbox',
					id: 'xUpdate',
					label: 'append global Update',
					default: false,
				},
			],
			callback: async (action) => {
				let value: string | number | boolean | string[] = ''
				if (action.options.valuetype === '1') {
					value = action.options.textValue
				} else if (action.options.valuetype === '2') {
					value = action.options.numericValue
				} else if (action.options.valuetype === '3') {
					value = parseBoolean(action.options.booleanValue)
				} else if (action.options.valuetype === '4') {
					value = JSON.parse(action.options.objectValue)
				}
				try {
					//const obj = JSON.parse(action.options.command) // check if the data is a valid json TODO: further validation
					const path = this.instance.AWJtoJsonPath(action.options.path)
					if (path.length > 1) {
						this.connection.sendWSmessage(path, value)
						//this.device.sendRawWSmessage(`{"channel":"DEVICE","data":{"path":${JSON.stringify(path)},"value":${value}}}`)
					}
					if (parseBoolean(action.options.xUpdate)) {
						this.instance.sendXupdate()
					}
				} catch (error) {
					this.instance.log('warn', 'Custom command transmission failed')
				}
			},
			learn: (_action) => {
				const newoptions: Partial<Cstawjcmd> = {}
				const lastMsg = this.state.get('LOCAL/lastMsg')
				const path = lastMsg.path
				const value = lastMsg.value
				if (JSON.stringify(value).length > 132) {
					return undefined
				}
				newoptions['path'] = this.instance.jsonToAWJpath(path)
				switch (typeof value) {
					case 'string':
						newoptions['valuetype'] = '1'
						newoptions['textValue'] = value
						break
					case 'number':
						newoptions['valuetype'] = '2'
						newoptions['numericValue'] = value
						break
					case 'boolean':
						newoptions['valuetype'] = '3'
						newoptions['booleanValue'] = value
						break
					case 'object':
						newoptions['valuetype'] = '4'
						newoptions['objectValue'] = JSON.stringify(value)
				}

				return newoptions
			},
		}

		return cstawjcmd
	}

	/**
	 * MARK: Send custom AWJ get command
	 */
	get cstawjgetcmd() {
		type Cstawjgetcmd = {path: string, variableValue: string | null | undefined, variableType: string | null | undefined}
		
		const cstawjgetcmd: AWJaction<Cstawjgetcmd> = {
			name: 'Custom Commands - Send custom AWJ get command',
			sortName: '11 Custom Commands - Send custom AWJ get command',
			description:
				'Reads a single value directly from the device using its own internal protocol - for advanced setups that the built-in feedbacks/variables don\'t cover. The Path is not checked, so a typo simply returns nothing without any warning. Tip: the T-Bar side ("A"/"B") swaps between Program and Preview with every Take - if you want to always read whichever side is currently Program or Preview instead of a fixed side, type "PGM" or "PRW" (the earlier "PVW" still works too) in the Path instead of "A"/"B".',
			options: [
				{
					type: 'textinput',
					id: 'path',
					label: 'Path to get',
					useVariables: true,
				},
				{
					type: 'custom-variable',
					id: 'variableValue',
					label: 'Variable to store value'
				},
				{
					type: 'custom-variable',
					id: 'variableType',
					label: 'Variable to store type'
				},
			],
			callback: async (action, context) => {
				let value: string | number | boolean | object= 'undefined'
				let type = 'undefined'
				try {
					//const obj = JSON.parse(action.options.command) // check if the data is a valid json TODO: further validation
					const path = this.instance.AWJtoJsonPath(action.options.path)
					if (path.length > 1) {
						value = this.state.get(['DEVICE', ...path])
						type = typeof value
					}
					
				} catch (error) {
					this.instance.log('warn', 'Custom command get failed')
				}
				if (type === 'null') value = 'null'
				if (type === 'object') value = JSON.stringify(value)
				if (type === 'boolean') value = value ? 1 : 0
				if (typeof value !== 'string') value = value.toString()

				if (typeof action.options.variableValue === 'string') {
					context.setCustomVariableValue(action.options.variableValue, value)
				}
				if (typeof action.options.variableType === 'string') {
					context.setCustomVariableValue(action.options.variableType, type)
				}
			},
			learn: (_action) => {
				const newoptions: Partial<Cstawjgetcmd> = {}
				const lastMsg = this.state.get('LOCAL/lastMsg')
				const path = lastMsg.path
				const value = lastMsg.value
				if (JSON.stringify(value).length > 132) {
					return undefined
				}
				newoptions['path'] = this.instance.jsonToAWJpath(path)

				return newoptions
			},
		}

		return cstawjgetcmd
	}

	/**
	 * Resolves a "Backup Set" dropdown value (as produced by choices.getBackupSetChoices(), "INPUT:IN_n" or
	 * "GROUP:GROUP_n") to the AWJ path of its control.pp object (without the leading "device" - matches
	 * connection.sendWSmessage()'s own path convention, callers prepend 'DEVICE' themselves for state reads).
	 */
	private getBackupControlPath(target: string): string[] | undefined {
		const [kind, ...rest] = (target ?? '').split(':')
		if (kind === 'INPUT' && rest[0]) return ['device', 'inputList', 'items', rest[0], 'backup', 'control', 'pp']
		if (kind === 'GROUP' && rest[0]) return ['device', 'backup', 'groupList', 'items', rest[0], 'control', 'pp']
		if (kind === 'BGSET' && rest[0] && rest[1]) {
			return ['device', 'preconfig', 'backgrounds', 'screenList', 'items', rest[0], 'backgroundSetList', 'items', rest[1], 'backup', 'control', 'pp']
		}
		return undefined
	}

	/**
	 * Shared firmware-version gate for features that exist on this same Aquilon hardware line (LivePremier/
	 * LivePremier4) but only from a certain firmware generation onward - Backup (V6+) and Layer Properties -
	 * Keying (V6+, same threshold - both live-confirmed together on a real V6.2.73 Aquilon, never confirmed
	 * below V6) are the first two uses. Below the required version, the action stays visible (so a user on old
	 * firmware can still find it and learn why it doesn't work) but swaps all its real options for a single
	 * notice via firmwareGateOptions(), instead of disappearing outright. `LOCAL/deviceFirmwareGeneration` is
	 * set once per connect in connection.ts as `V${major}` (or '' if unparseable) - reads live/fresh here since
	 * action getters re-run every time allActions is rebuilt (on every updateInstance(), including right after
	 * connect), so no separate reactivity mechanism is needed.
	 * Note: this only applies to features missing on OLD firmware of a platform that otherwise has the
	 * concept. Where the concept is structurally absent on a whole different platform (Backup and Keying are
	 * BOTH also missing on Midra/Alta entirely, live-confirmed 2026-08-28 against a Zenith 200 simulator, fw
	 * 1.3.7) that platform instead removes the action from its own actionsToUse entirely - this check is never
	 * reached there.
	 */
	private isFirmwareAtLeast(minMajor: number): boolean {
		const fwGen: string = this.instance.state.get('LOCAL/deviceFirmwareGeneration') ?? ''
		const fwMajor = parseInt(fwGen.replace('V', ''))
		return !isNaN(fwMajor) && fwMajor >= minMajor
	}

	private firmwareGateOptions(minVersion: string): SomeAWJactionInputfield<any>[] {
		return [
			{
				id: 'firmwareNotice',
				type: 'static-text',
				label: '',
				value: `This action requires device firmware ${minVersion} or newer. Please update your device's firmware to use this feature.`,
				disableAutoExpression: true,
			},
		]
	}

	/**
	 * Polls this.state until `predicate` matches the value at `path`, or `timeoutMs` elapses - lets an async
	 * action callback block until the DEVICE has actually confirmed a change (its own state push arriving back
	 * over the websocket), not just until our own outgoing message was sent. Companion runs a plain sequential
	 * action list one at a time, awaiting each async callback before starting the next (unlike an explicit
	 * "Action Group", which runs its members in parallel) - so awaiting this inside a "Save to Slot"-style
	 * action makes a zero-delay loop of many such actions safe: each iteration's read of "next available slot"
	 * only happens after the previous save's device confirmation has already updated our local state cache.
	 * Resolves `true` if the value was seen in time, `false` on timeout (never rejects - a stuck/slow device
	 * should not hang a button forever, just skip the extra safety this wait provides for that one call).
	 */
	protected waitForStateValue(path: string[], predicate: (value: unknown) => boolean, timeoutMs = 3000, intervalMs = 50): Promise<boolean> {
		return new Promise((resolve) => {
			const start = Date.now()
			const check = () => {
				if (predicate(this.state.get(path))) {
					resolve(true)
					return
				}
				if (Date.now() - start >= timeoutMs) {
					resolve(false)
					return
				}
				setTimeout(check, intervalMs)
			}
			check()
		})
	}

	/**
	 * Waits out a transient boolean "isLoading"-style pulse at `path` (confirmed live, 2026-08-28, e.g.
	 * masterPresetBank/control/load/.../pp/isLoading) - rather than a level value like a bank slot's own
	 * `isValid` (see waitForStateValue() above), a pulse can flip true->false faster than one poll interval,
	 * so a naive single waitForStateValue(path, v => v === false) could resolve instantly without ever having
	 * actually observed the load in progress. This first waits (briefly) for the rising edge, and only then
	 * waits for the falling edge; if the rising edge is never observed within `startGraceMs` (load finished
	 * faster than we could poll, or never started), it simply returns rather than waiting out the full timeout.
	 * `startGraceMs` default raised to 1000ms (2026-08-28) after a live false-negative was found on "Wait for
	 * Transition Completion": the original 300ms was too tight for the real round-trip from our own outgoing
	 * command to the device's status update landing back in our local state cache, so the rising edge was
	 * sometimes missed entirely and the function returned immediately, as if no transition had happened at all.
	 */
	protected async waitForPulseComplete(path: string[], startGraceMs = 1000, timeoutMs = 3000, intervalMs = 20): Promise<void> {
		const wentTrue = await this.waitForStateValue(path, (v) => v === true, startGraceMs, intervalMs)
		if (wentTrue) {
			await this.waitForStateValue(path, (v) => v === false, timeoutMs, intervalMs)
		}
	}

	/**
	 * Same rising-then-falling-edge idea as waitForPulseComplete() above, but for a value that isn't a plain
	 * boolean pulse - e.g. Take's own status (LivePremier4: screenAuxGroupList/.../status/pp/take, confirmed
	 * live to read "OFF" while idle) which changes to some other, unconfirmed busy value while the transition
	 * is actually running, then back to "OFF" once it's fully finished. Not knowing the exact busy value(s) is
	 * fine here - the rising-edge check only needs "no longer equal to `restValue`", not what it changed to.
	 *
	 * `timeoutMs` capped well under 5000ms (2026-08-28) after live-confirming a **hard** Companion platform
	 * limit: Companion's own module-host IPC call for a single action invocation times out at exactly 5000ms
	 * (confirmed live down to the millisecond - "Call timed out" at sendWithCb, logged exactly 5000ms after
	 * this action started waiting), regardless of whether the actions are inside a Sequential Action Group.
	 * When that happens, Companion logs the scary error but still proceeds to the next action anyway (it just
	 * gives up on this one) - so staying under that ceiling ourselves produces the exact same practical outcome
	 * (the sequence moves on around the same moment) without the alarming error line. This means "Wait for
	 * Transition Completion" can only ever really cover Transition Times up to a few seconds - a real fade
	 * longer than that will have the next action fire before the fade visually finishes no matter what, because
	 * Companion itself will not let a single action callback run any longer than that, full stop.
	 */
	protected async waitForLevelReturnToRest(path: string[], restValue: unknown, startGraceMs = 1000, timeoutMs = 3500, intervalMs = 50): Promise<void> {
		const left = await this.waitForStateValue(path, (v) => v !== restValue, startGraceMs, intervalMs)
		if (left) {
			await this.waitForStateValue(path, (v) => v === restValue, timeoutMs, intervalMs)
		}
	}

	/**
	 * Fixed delay, for commands (Take/Cut) that have no clean "command received" confirmation signal to poll
	 * for - their own status (screenAuxGroupList status.pp.take) reflects the whole visible transition
	 * duration, not just receipt, and would make a fade with a multi-second Transition Time block the rest of
	 * a button's action sequence for that whole time, which is very much not what a "did it register" check
	 * should do. Per explicit user decision (2026-08-28): a short fixed pause is enough to make sure the
	 * command has been sent and picked up by the device before the next action in the sequence runs, without
	 * introducing a visible delay for the operator.
	 */
	protected delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}

	/**
	 * MARK: Backups - Set Backup Set to Source
	 * Manually selects which source (Primary/Backup1/Backup2) is active for a Backup Set or Backup Group.
	 * Confirmed live: xSelectSlot is PE_INPUT_BACKUP_SLOT_SEL, values NONE (=Primary)/1/2, identical shape on
	 * both an ungrouped input's own backup.control.pp and a Group's control.pp.
	 */
	get deviceBackupSetSource() {
		type DeviceBackupSetSource = { target: string, source: string }

		if (!this.isFirmwareAtLeast(6)) {
			return {
				name: 'Backups - Set Backup Set to Source',
				sortName: '10 Backups - Set Backup Set to Source',
				description: 'Switches a Backup Set (or every Set in a Backup Group) to show its Primary source, Backup 1, or Backup 2 - the same manual override WebRCS offers per Backup Set.',
				options: this.firmwareGateOptions('V6'),
				callback: () => {},
			}
		}

		const deviceBackupSetSource: AWJaction<DeviceBackupSetSource> = {
			name: 'Backups - Set Backup Set to Source',
			sortName: '10 Backups - Set Backup Set to Source',
			description: 'Switches a Backup Set (or every Set in a Backup Group) to show its Primary source, Backup 1, or Backup 2 - the same manual override WebRCS offers per Backup Set.',
			options: [
				{
					id: 'target',
					type: 'dropdown',
					label: 'Backup Set / Group',
					choices: this.choices.getBackupSetChoices(),
					default: this.choices.getBackupSetChoices()[0]?.id,
					allowInvalidValues: true,
				},
				{
					id: 'source',
					type: 'dropdown',
					label: 'Source',
					choices: [
						{ id: 'NONE', label: 'Primary' },
						{ id: '1', label: 'Backup 1' },
						{ id: '2', label: 'Backup 2' },
					],
					default: 'NONE',
				},
			],
			learn: (action) => {
				const path = this.getBackupControlPath(action.options.target)
				if (!path) return undefined
				const source = this.state.get(['DEVICE', ...path, 'xSelectSlot'])
				if (typeof source !== 'string') return undefined
				return { target: action.options.target, source }
			},
			callback: (action) => {
				const path = this.getBackupControlPath(action.options.target)
				if (!path) return
				this.connection.sendWSmessage([...path, 'xSelectSlot'], action.options.source)
				this.instance.sendXupdate()
			},
		}

		return deviceBackupSetSource
	}

	/**
	 * MARK: Backups - Set Auto Mode
	 * Turns automatic backup source switching (on signal loss) on/off for a Backup Set or Backup Group.
	 */
	get deviceBackupAutoMode() {
		type DeviceBackupAutoMode = { target: string, mode: string }

		if (!this.isFirmwareAtLeast(6)) {
			return {
				name: 'Backups - Set Auto Mode',
				sortName: '10 Backups - Set Auto Mode',
				description: 'Turns Auto Mode on, off, or toggles it for a Backup Set (or every Set in a Backup Group) - when on, the device automatically switches to a Backup source if the Primary signal is lost.',
				options: this.firmwareGateOptions('V6'),
				callback: () => {},
			}
		}

		const deviceBackupAutoMode: AWJaction<DeviceBackupAutoMode> = {
			name: 'Backups - Set Auto Mode',
			sortName: '10 Backups - Set Auto Mode',
			description: 'Turns Auto Mode on, off, or toggles it for a Backup Set (or every Set in a Backup Group) - when on, the device automatically switches to a Backup source if the Primary signal is lost.',
			options: [
				{
					id: 'target',
					type: 'dropdown',
					label: 'Backup Set / Group',
					choices: this.choices.getBackupSetChoices(),
					default: this.choices.getBackupSetChoices()[0]?.id,
					allowInvalidValues: true,
				},
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Auto Mode',
					choices: [
						{ id: 'on', label: 'On' },
						{ id: 'off', label: 'Off' },
						{ id: 'toggle', label: 'Toggle' },
					],
					default: 'on',
				},
			],
			learn: (action) => {
				const path = this.getBackupControlPath(action.options.target)
				if (!path) return undefined
				const enabled = this.state.get(['DEVICE', ...path, 'enableAutoSelect'])
				if (typeof enabled !== 'boolean') return undefined
				return { target: action.options.target, mode: enabled ? 'on' : 'off' }
			},
			callback: (action) => {
				const path = this.getBackupControlPath(action.options.target)
				if (!path) return
				let newstate = action.options.mode === 'on'
				if (action.options.mode === 'toggle') {
					newstate = !this.state.get(['DEVICE', ...path, 'enableAutoSelect'])
				}
				this.connection.sendWSmessage([...path, 'enableAutoSelect'], newstate)
				this.instance.sendXupdate()
			},
		}

		return deviceBackupAutoMode
	}

	/**
	 * MARK: Device Power
	 */
	get devicePower() {
		type DevicePower = {action : string}
		

		const devicePower: AWJaction<DevicePower> = {
			name: 'Device - Power',
			sortName: '09 Device - Power',
			description: 'Switches the device on (Wake on LAN), off, or reboots it.',
			options: [
				{
					id: 'action',
					type: 'dropdown',
					label: 'Power',
					choices: [
						{ id: 'on', label: 'Switch on (Wake on LAN)' },
						{ id: 'off', label: 'Switch to Power off' },
						{ id: 'reboot', label: 'Reboot' },
					],
					default: 'on',
				},
			],
			callback: (action) => {
				const path = ['device','system','shutdown','cmd','pp','xRequest']

				if (action.options.action === 'on') {
					const mac = this.instance.config.macaddress.split(/[,:-_.\s]/).join('')
					this.connection.wake(mac)
					this.connection.resetReconnectInterval()
				}
				if (action.options.action === 'off') {
					// this.device.sendWSmessage(path + 'pp/wakeOnLan', true)
					// this.device.sendWSmessage(path + 'pp/xRequest', false)
					// this.device.sendWSmessage(path + 'pp/xRequest', true)
					this.connection.sendWSmessage(path, 'NONE', 'SHUTDOWN')
				}
				if (action.options.action === 'reboot') {
					this.connection.sendWSmessage(path, 'NONE', 'REBOOT')
				}
			}
		}

		return devicePower
	}

}
