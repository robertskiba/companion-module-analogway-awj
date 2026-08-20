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
	tooltip?: string,
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
		'deviceAuxMemory',
		'deviceMasterMemory',
		'deviceMultiviewerMemory',
		'deviceLayerMemory',
		'deviceTakeScreen',
		'deviceCutScreen',
		'deviceTbar',
		'deviceTakeTime',
		'deviceSelectSource',
		'deviceInputKeying',
		'deviceInputFreeze',
		'deviceLayerFreeze',
		'deviceScreenFreeze',
		'deviceAssignImageLibraryToStore',
		'devicePositionSize',
		'devicePositionSizeV3',
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
		const returnAction: AWJaction<{ screens: string[], preset: string, memory: string, selectScreens: boolean}> = {
			name: 'Recall Screen Memory',
			options: [
				{
					id: 'screens',
					allowInvalidValues: true,
					type: 'multidropdown',
					label: 'Screen',
					choices: [{ id: 'sel', label: 'Selected' }],
					default: ['sel'],
				},
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset',
					choices: [{ id: 'sel', label: 'Selected' }, ...this.choices.choicesPreset],
					default: 'sel',
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
					default: true,
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
		type DeviceLayerMemory = { method: string, screen: string[], preset: string, layer: string[], memory: string }
		
		const returnAction: AWJaction<DeviceLayerMemory> = {
			name: 'Recall Layer Memory',
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
					label: 'Preset',
					choices: [{ id: 'sel', label: 'Selected' }, ...this.choices.choicesPreset],
					default: 'pvw',
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
				for (const layer of layers) {
					if (this.choices.isLocked(layer.screenAuxKey, preset)) continue
					this.connection.sendWSmessage(
						[
							'device',
							'layerBank',
							'control',
							'load',
							'slotList',
							'items',
							action.options.memory,
							layer.screenAuxKey.charAt(0) === 'A' ? this.constants.auxPath[1] : this.constants.screenPath[1],
							'items',
							layer.screenAuxKey,
							'presetList',
							'items',
							preset,
							'layerList',
							'items',
							layer.layerKey,
							'pp',
							'xRequest',
						],
						false, true
					)
				}
				this.instance.sendXupdate()
			},
		}

		return returnAction
	}
		
	// MARK: recall Aux memory
	get deviceAuxMemory() {
		
		const deviceAuxMemory: AWJaction<{ screens: string[], preset: string, memory: string, selectScreens: boolean}> = {
			name: 'Recall Aux Memory',
			options: [
				{
					id: 'screens',
					allowInvalidValues: true,
					type: 'multidropdown',
					label: 'Auxscreen',
					choices: [{ id: 'sel', label: 'Selected' }, ...this.choices.getAuxChoices()],
					default: ['sel'],
				},
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset',
					choices: [{ id: 'sel', label: 'Selected' }, ...this.choices.choicesPreset],
					default: 'sel',
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
		
		const deviceMasterMemory: AWJaction<{preset: string, memory: string, selectScreens: boolean}> = {
			name: 'Recall Master Memory',
			options: [
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset',
					choices: [{ id: 'sel', label: 'Selected' }, ...this.choices.choicesPreset],
					default: 'sel',
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
					default: true,
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
			name: 'Recall Multiviewer Memory',
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
		type DeviceTakeScreen = {screens: string[]}
		const deviceTakeScreen: AWJaction<DeviceTakeScreen> = {
			name: 'Take Screen',
			options: [
				{
					id: 'screens',
					allowInvalidValues: true,
					type: 'multidropdown',
					label: 'Screens / Auxscreens',
					choices: [
						{ id: 'all', label: 'All' },
						{ id: 'sel', label: 'Selected Screens' },
						...this.choices.getScreenAuxChoices()
					],
					default: ['sel'],
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
		type DeviceCutScreen = {screens: string[]}
		
		const deviceCutScreen: AWJaction<DeviceCutScreen> = {
			name: 'Cut Screen',
			options: [
				{
					id: 'screens',
					allowInvalidValues: true,
					type: 'multidropdown',
					label: 'Screens / Auxscreens',
					choices: [{ id: 'all', label: 'All' }, { id: 'sel', label: 'Selected Screens' }, ...this.choices.getScreenAuxChoices()],
					default: ['sel'],
				},
			],
			callback: (action) => {
				for (const screen of this.choices.getChosenScreenAuxes(action.options.screens)) {
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
			},
		}

		return deviceCutScreen
	}

	/**
	 * MARK: Set T-Bar Position
	 */
	get deviceTbar() {
		type DeviceTbar = {screens: string[], position: string, maximum: string}
		
		const deviceTbar: AWJaction<DeviceTbar> = {
			name: 'Set T-Bar Position',
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
					type: 'multidropdown',
					label: 'Screens / Auxscreens',
					choices: [{ id: 'all', label: 'All' }, { id: 'sel', label: 'Selected Screens' }, ...this.choices.getScreenAuxChoices()],
					default: ['all'],
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
					for (const screen of this.choices.getChosenScreenAuxes(action.options.screens)) {
						this.connection.sendWSmessage([...this.constants.screenGroupPath, 'items', screen, 'control', 'pp', 'tbarPosition'], tbarint)
					}
				}
			},
		}

		return deviceTbar
	}

	/**
	 * MARK: Change the transition time of a preset per screen
	 */
	get deviceTakeTime() {
		type DeviceTakeTime = {screens: string[], preset: string, time: number}
		
		const deviceTakeTime: AWJaction<DeviceTakeTime> = {
			name: 'Set Transition Time',
			options: [
				{
					id: 'screens',
					allowInvalidValues: true,
					type: 'multidropdown',
					label: 'Screens / Auxscreens',
					choices: [{ id: 'all', label: 'All' }, { id: 'sel', label: 'Selected Screens' }, ...this.choices.getScreenAuxChoices()],
					default: ['all'],
				},
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset',
					choices: [{ id: 'all', label: 'Both' }, ...this.choices.choicesPreset],
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
				const time = action.options.time as number * 10
				this.choices.getChosenScreenAuxes(action.options.screens).forEach((screen) => {
					const presetPgm = this.choices.getPreset(screen, 'PGM')
					// direction must match deviceTakeScreen's mapping: presetPgm === 'A' means the next take moves the T-Bar up (xTakeUp),
					// so "pgm" (the direction leading into the new program) corresponds to takeUpTime there, not takeDownTime
					if (
						action.options.preset === 'all' ||
						(action.options.preset === 'pgm' && presetPgm === 'B') ||
						(action.options.preset === 'pvw' && presetPgm === 'A')
					) {
						this.connection.sendWSmessage([...this.constants.screenGroupPath, 'items', screen, 'control', 'pp', 'takeDownTime'], time)
					}
					if (
						action.options.preset === 'all' ||
						(action.options.preset === 'pvw' && presetPgm === 'B') ||
						(action.options.preset === 'pgm' && presetPgm === 'A')
					) {
						this.connection.sendWSmessage([...this.constants.screenGroupPath, 'items', screen, 'control', 'pp', 'takeUpTime'], time)
					}
				})
			},
		}

		return deviceTakeTime
	}

	// MARK: Select the source in a layer
	get deviceSelectSource() {
		type DeviceSelectSource = {method: string, screen: string[], preset: string}
		
		const deviceSelectSource: AWJaction<DeviceSelectSource> = {
			name: 'Select Layer Source',
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
					label: 'Preset',
					choices: this.choices.choicesPreset,
					default: 'pvw',
					isVisibleExpression: "$(options:method) == 'spec'",
				},
			],
			callback: () => {},
		}

		return deviceSelectSource
	}

	/**
	 * MARK: Set input keying
	 */
	get deviceInputKeying() {
		type DeviceInputKeying = {input: string, mode: string}
		
		const deviceInputKeying: AWJaction<DeviceInputKeying> = {
			name: 'Set Input Keying',
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
			name: 'Set Input Freeze',
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
			name: 'Set Layer Freeze',
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
			name: 'Set Screen Freeze',
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
			name: 'Assign Image from Library to Image Store',
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
		type DevicePositionSizeV3 = {screen: string, preset: string, layersel: string, anchor: AnchorPoint | 'sel', x: string, y: string, w: string, h: string, keepAspectRatio: boolean, refW: string, refH: string} & Record<string, string>
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

		/** Resolves the "screen"/"layersel"/"layer{screen}" options into concrete target layers. "first" targets
		 * only the first (Ctrl-clicked first in WebRCS, same layer the SelectedLayer.* variables describe) of a
		 * multi-selection - safer than "sel" (all selected layers) for X/Y/W/H values that were read from those
		 * variables, since those only ever describe that one layer. */
		const resolveLayers = (opt: DevicePositionSizeV3): {screenAuxKey: string, layerKey: string}[] => {
			if (opt.screen === 'sel') {
				if (opt.layersel === 'sel') return this.choices.getSelectedLayers()
				if (opt.layersel === 'first') return this.choices.getSelectedLayers().slice(0, 1)
				return [{screenAuxKey: opt.screen, layerKey: opt.layersel}]
			} else {
				const layerOpt = opt[`layer${opt.screen}`]
				if (layerOpt === 'sel') return this.choices.getSelectedLayers().filter(layer => layer.screenAuxKey == opt.screen)
				if (layerOpt === 'first') return this.choices.getSelectedLayers().filter(layer => layer.screenAuxKey == opt.screen).slice(0, 1)
				return [{screenAuxKey: opt.screen, layerKey: layerOpt}]
			}
		}

		const devicePositionSizeV3: AWJaction<DevicePositionSizeV3> = {
			name: 'Set Layer Position and Size V3',
			options: [
				{
					id: 'screen',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screen / Aux',
					choices: [{ id: 'sel', label: 'Selected Screen(s)' }, ...this.choices.getScreenAuxChoices()],
					default: 'sel',
					disableAutoExpression: true,
				},
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset',
					choices: [{ id: 'sel', label: 'Selected Preset' }, ...this.choices.choicesPreset],
					default: 'sel',
				},
				{
					id: `layersel`,
					type: 'dropdown',
					label: 'Layer',
					tooltip: 'When using "selected layer" and screen or preset are not using "Selected", you can narrow the selection. "First/Only Selected Layer" targets just the first (Ctrl-clicked first in WebRCS) of a multi-selection - safer to use when the X/Y/W/H values were read from the SelectedLayer.* variables, which also only ever describe that first layer, so applying them to every selected layer could move layers you did not intend to touch.',
					choices: [{ id: 'sel', label: 'All Selected Layers' }, { id: 'first', label: 'First/Only Selected Layer' }, ...Array.from({length: this.choices.getMaxConfiguredLayerCount()}, (_i, e:number) => {return {id: e+1, label: `Layer ${e+1}`}})],
					default: 'first',
					isVisibleExpression: "$(options:screen) == 'sel'",
				},
				...this.screens.map((screen) => {
					return{
						id: `layer${screen.id}`,
						type: 'dropdown' as const,
						label: 'Layer',
						tooltip: 'When using "selected layer" and screen or preset are not using "Selected", you can narrow the selection. "First/Only Selected Layer" targets just the first (Ctrl-clicked first in WebRCS) of a multi-selection - safer to use when the X/Y/W/H values were read from the SelectedLayer.* variables, which also only ever describe that first layer, so applying them to every selected layer could move layers you did not intend to touch.',
						choices: [{ id: 'sel', label: 'All Selected Layers' }, { id: 'first', label: 'First/Only Selected Layer' }, ...this.choices.getLayerChoices(screen.id, false)],
						default: 'first',
						isVisibleExpression: `$(options:screen) == '${screen.id}'`,
					}
				}),
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
				newoptions[`layer${screeninfo.id}`] = layers[0].layerKey.replace(/^\w+_/, '')
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

				this.instance.sendXupdate()
			},
		}

		return devicePositionSizeV3

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
			name: 'Set Anchor Point',
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

		/** Resolves the "screen"/"layersel"/"layer{screen}" options into concrete target layers. "first" targets
		 * only the first (Ctrl-clicked first in WebRCS, same layer the SelectedLayer.* variables describe) of a
		 * multi-selection - safer than "sel" (all selected layers) for Source Ratio/Content Size, which resize
		 * relative to each layer's own current size. */
		const resolveLayers = (opt: DeviceResetLayerSize): {screenAuxKey: string, layerKey: string}[] => {
			if (opt.screen === 'sel') {
				if (opt.layersel === 'sel') return this.choices.getSelectedLayers()
				if (opt.layersel === 'first') return this.choices.getSelectedLayers().slice(0, 1)
				return [{screenAuxKey: opt.screen, layerKey: opt.layersel}]
			} else {
				const layerOpt = opt[`layer${opt.screen}`]
				if (layerOpt === 'sel') return this.choices.getSelectedLayers().filter(layer => layer.screenAuxKey == opt.screen)
				if (layerOpt === 'first') return this.choices.getSelectedLayers().filter(layer => layer.screenAuxKey == opt.screen).slice(0, 1)
				return [{screenAuxKey: opt.screen, layerKey: layerOpt}]
			}
		}

		const deviceResetLayerSize: AWJaction<DeviceResetLayerSize> = {
			name: 'Reset Layer Size or Ratio',
			options: [
				{
					id: 'screen',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screen / Aux',
					choices: [{ id: 'sel', label: 'Selected Screen(s)' }, ...this.choices.getScreenAuxChoices()],
					default: 'sel',
					disableAutoExpression: true,
				},
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset',
					choices: [{ id: 'sel', label: 'Selected Preset' }, ...this.choices.choicesPreset],
					default: 'sel',
				},
				{
					id: `layersel`,
					type: 'dropdown',
					label: 'Layer',
					tooltip: 'When using "selected layer" and screen or preset are not using "Selected", you can narrow the selection. "First/Only Selected Layer" targets just the first (Ctrl-clicked first in WebRCS, same layer the SelectedLayer.* variables describe) of a multi-selection - safer to use with Source Ratio/Content Size, which resize relative to each layer\'s own current size, so applying to every selected layer at once could resize layers differently than intended.',
					choices: [{ id: 'sel', label: 'All Selected Layers' }, { id: 'first', label: 'First/Only Selected Layer' }, ...Array.from({length: this.choices.getMaxConfiguredLayerCount()}, (_i, e:number) => {return {id: e+1, label: `Layer ${e+1}`}})],
					default: 'first',
					isVisibleExpression: "$(options:screen) == 'sel'",
				},
				...this.screens.map((screen) => {
					return{
						id: `layer${screen.id}`,
						type: 'dropdown' as const,
						label: 'Layer',
						tooltip: 'When using "selected layer" and screen or preset are not using "Selected", you can narrow the selection. "First/Only Selected Layer" targets just the first (Ctrl-clicked first in WebRCS, same layer the SelectedLayer.* variables describe) of a multi-selection - safer to use with Source Ratio/Content Size, which resize relative to each layer\'s own current size, so applying to every selected layer at once could resize layers differently than intended.',
						choices: [{ id: 'sel', label: 'All Selected Layers' }, { id: 'first', label: 'First/Only Selected Layer' }, ...this.choices.getLayerChoices(screen.id, false)],
						default: 'first',
						isVisibleExpression: `$(options:screen) == '${screen.id}'`,
					}
				}),
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
			name: 'Set Position and Size (V2, deprecated, please upgrade to new action V3)',
			options: [
				{
					id: 'screen',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screen / Aux',
					choices: [{ id: 'sel', label: 'Selected Screen(s)' }, ...this.choices.getScreenAuxChoices()],
					default: 'sel',
					disableAutoExpression: true,
				},
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset',
					choices: [{ id: 'sel', label: 'Selected Preset' }, ...this.choices.choicesPreset],
					default: 'sel',
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
		type DeviceCopyProgram = {screens: string[]}
		
		const deviceCopyProgram: AWJaction<DeviceCopyProgram> = {
			name: 'Copy Program to Preview',
			options: [
				{
					id: 'screens',
					allowInvalidValues: true,
					type: 'multidropdown',
					label: 'Screens / Auxscreens',
					choices: [{ id: 'all', label: 'All' }, { id: 'sel', label: 'Selected Screens' }, ...this.choices.getScreenAuxChoices()],
					default: ['sel'],
				},
			],
			callback: (action) => {
				for (const screen of this.choices.getChosenScreenAuxes(action.options.screens)) {
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
			name: 'Set Preset Toggle (Program/Preview)',
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
			name: 'Multiviewer Widget Selection',
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
			name: 'Select Source in Multiviewer Widget',
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
			name: 'Screen Selection',
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
							label: 'Intelligent reset action',
						},
					],
					default: 2,
				},
			],
			callback: (action) => {
				let sel = action.options.sel
				const surface = action.surfaceId ? action.surfaceId : ''
				const id = surface + action.controlId
				if (sel === 6 || (sel === 5 && !id.length )) {
					this.state.set('LOCAL/intelligent/screenSelectionRunning', undefined)
					return
				} else if (sel === 4 && id.length) {
					if (this.state.get('LOCAL/intelligent/screenSelectionRunning')) {
						sel = 3
					} else {
						this.state.set('LOCAL/intelligent/screenSelectionRunning', id)
						sel = 2
					}
				} else if (sel === 5 && id.length) {
					if (this.state.get('LOCAL/intelligent/screenSelectionRunning') === id) {
						this.state.set('LOCAL/intelligent/screenSelectionRunning', undefined)
					}
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
		type LockScreen = {screens: string[], preset: string, lock: string}
		
		const lockScreen: AWJaction<LockScreen> = {
			name: 'Lock Screen',
			options: [
				{
					
					id: 'screens',
					allowInvalidValues: true,
					label: 'Screen',
					type: 'multidropdown',
					choices: [{ id: 'all', label: 'ALL' }, { id: 'sel', label: 'Selected' }, ...this.choices.getScreenAuxChoices()],
					default: ['all'],
					tooltip:
						'If you choose "All" and "Toggle", the behavior is exactly like in WebRCS, if you choose multiple screens they will be toggled individually',
				},
				{
					id: 'preset',
					label: 'Preset',
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
				const screens = action.options.screens
				const pst = action.options.preset === 'PREVIEW' ? 'Prw' : 'Pgm'
				if (this.state.syncSelection) {
					if (action.options.lock === 'lock' || action.options.lock === 'unlock') {
						const scrs = this.choices.getChosenScreenAuxes(screens)
							.map( screenId => this.choices.getScreenInfo(screenId).platformLongId )
						this.connection.sendWSdata(
							'REMOTE',
							action.options.lock + 'ScreenAuxes' + pst,
							'/live/screens/presetModeLock',
							[scrs]
						)
					} else if (action.options.lock === 'toggle') {
						if (screens.includes('all')) {
							const allscreens = this.choices.getChosenScreenAuxes(screens)
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
							for (const screen of this.choices.getChosenScreenAuxes(screens)) {
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
						for (const screen of this.choices.getChosenScreenAuxes(screens)) {
							localLocks[screen] = true
						}
					} else if (action.options.lock === 'unlock') {
						for (const screen of this.choices.getChosenScreenAuxes(screens)) {
							localLocks[screen] = false
						}
					} else if (action.options.lock === 'toggle') {
						if (screens.includes('all')) {
							const allscreens = this.choices.getChosenScreenAuxes('all')
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
							for (const screen of this.choices.getChosenScreenAuxes(screens)) {
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
			name: 'Select Preset (Program/Preview)',
			options: [
				{
					id: 'mode',
					label: 'Preset',
					type: 'dropdown',
					choices: [
						{ id: 'pgm', label: 'Program' },
						{ id: 'pvw', label: 'Preview' },
						{ id: 'tgl', label: 'Toggle' },
					],
					default: 'tgl',
				},
			],
			callback: (action) => {
				if (this.state.syncSelection) {
					switch (action.options.mode) {
						case 'pgm':
							this.connection.sendWSdata('REMOTE', 'set', '/live/screens/presetModeSelection', ['PROGRAM'])
							break
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
						case 'pvw':
							this.state.set('LOCAL/presetMode', 'PREVIEW')
							this.instance.setVariableValues({ selectedPreset: 'PVW' })
							break
						case 'tgl':
							if (this.state.get('LOCAL/presetMode') === 'PREVIEW') {
								this.state.set('LOCAL/presetMode', 'PROGRAM')
								this.instance.setVariableValues({ selectedPreset: 'PGM' })
							} else {
								this.state.set('LOCAL/presetMode', 'PREVIEW')
								this.instance.setVariableValues({ selectedPreset: 'PVW' })
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
			name: 'Select Layer',
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
			else defaultChoice = layerChoices[0].id

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
			name: 'Sync selection',
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
					vartext = 'PVW'
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
			name: 'Stream Control',
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
			name: 'Stream Audio Mute',
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
			name: 'Route Audio (Block)',
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
			name: 'Route Audio (Channels)',
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
			name: 'Timer Setup',
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
			name: 'Timer Adjust Time',
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
			name: 'Timer Transport',
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
	deviceTestpatterns_common(deviceTestpatternsOptions: CompanionInputFieldDropdown[]) {
		type DeviceTestpatterns = {group: string, screenList: string, outputList: string, patall: string, screenListPat: string, outputListPat: string, inputList?: string, inputListPat?: string}
		
		const deviceTestpatterns: AWJaction<DeviceTestpatterns> = {
			name: 'Set Testpattern',
			options: deviceTestpatternsOptions,
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
				}
			},
		}

		return deviceTestpatterns
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
					{ id: 'all', label: 'All' },
					{ id: 'screenList', label: 'Screen Canvas' },
					{ id: 'outputList', label: 'Output Group' },
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
				choices: [{ id: '0', label: 'Off' }],
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
			name: 'Send custom AWJ replace command',
			tooltip:
				'The "op" parameter is always replace. Paths and values are not validated, make sure to use only correct syntax! For your convenience you can use PGM and PVW aditionally to A and B to denote a preset',
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
			name: 'Send custom AWJ get command',
			tooltip:
				'The "op" parameter is always get. Path is not validated, make sure to use only correct syntax! For your convenience you can use PGM and PVW aditionally to A and B to denote a preset',
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
	 * MARK: Device Power
	 */
	get devicePower() {
		type DevicePower = {action : string}
		

		const devicePower: AWJaction<DevicePower> = {
			name: 'Device Power',
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
