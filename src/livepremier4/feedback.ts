import Feedbacks from '../awjdevice/feedback.js'
import {AWJinstance} from '../index.js'
import {
	CompanionFeedbackDefinition,
	CompanionInputFieldDropdown,
} from '@companion-module/base'


/** Helper type for replacing the very generic options with the real structure of options */
type ReplaceOptionsInFunctions<T, NewOptionsType> = T extends (...args: any[]) => any
  ? T extends (first: infer First, ...rest: infer Rest) => infer Return
    ? First extends { options: any } | { options?: any }
      ? (first: Omit<First, 'options'> & { options: NewOptionsType }, ...rest: Rest) => Return
      : T
    : T
  : T extends Array<infer U>
    ? Array<ReplaceOptionsInFunctions<U, NewOptionsType>>
    : T extends ReadonlyArray<infer U>
      ? ReadonlyArray<ReplaceOptionsInFunctions<U, NewOptionsType>>
      : T extends object
        ? { [K in keyof T]: ReplaceOptionsInFunctions<T[K], NewOptionsType> }
        : T;

/** Type which gives CompanionFeedbackDefinition but replaces the generic options with the structure givien in the parameter */
type AWJfeedback<K> = ReplaceOptionsInFunctions<CompanionFeedbackDefinition, K>

export default class FeedbacksLivepremier4 extends Feedbacks  {

	readonly feedbacksToUse = [		
		'syncselection',
		'presetToggle',
		'globalAnchorPoint',
		'deviceLayerPropertyStatus',
		'deviceMasterMemory',
		'deviceScreenMemory',
		'deviceScreenMemorySlotStatus',
		// 'deviceAuxMemory',
		'deviceSourceTally',
		'deviceTake',
		'liveScreenSelection',
		'liveScreenLock',
		'livePresetSelection',
		'remoteLayerSelection',
		'remoteWidgetSelection',
		'deviceInputFreeze',
		'deviceInputSignalStatus',
		'deviceLayerSignalStatus',
		'deviceHealthStatus',
		// 'deviceLayerFreeze',
		// 'deviceScreenFreeze',
		'timerState',
		'deviceGpioOut',
		'deviceGpioIn',
		// 'deviceStreaming',
		'deviceTestpatternActive',
		'deviceTestpatternRasterBoxActive',
		'deviceCustom',
		'deviceThumbnail',
		'deviceBackupSetSourceStatus',
		'deviceBackupAutoModeStatus',
		'deviceAudioRouteChannelsStatus',
		'deviceAudioRouteBlockStatus',
	]

	constructor (instance: AWJinstance) {
		super(instance)
		this.state = this.instance.state
		this.choices = this.instance.choices
		this.config = this.instance.config
		this.constants = this.instance.constants
	}

	// MARK: Screen Memory
	get deviceScreenMemory() {
		
		const deviceScreenMemory = super.deviceScreenMemory
			
		deviceScreenMemory.options[0] =
			{
				id: 'screens',
				type: 'dropdown',
				label: 'Screens / Auxscreens',
				choices: [{ id: 'all', label: 'Any Screen' }, ...this.choices.getScreenAuxChoices()],
				multiple: true,
				default: ['all'],
				allowInvalidValues: true,
			} as any // TODO: fix type of dropdown with multiple: true property

		deviceScreenMemory.callback =  (feedback) => {
			const screens = this.choices.getChosenScreensSupportedByScreenMemories(feedback.options.screens)
			const presets = feedback.options.preset === 'all' ? ['pgm', 'pvw'] : [feedback.options.preset]
			
			for (const screen of screens) {
				const screeninfo = this.choices.getScreenInfo(screen)
				for (const preset of presets) {
					const propPath = [
							'DEVICE', 'device', 'presetBank', 'status', 'presetId',
							screeninfo.isAux ? 'auxiliaryList' : 'screenList',
							'items',
							screeninfo.platformId,
							'presetList',
							'items',
							this.choices.getPreset(screeninfo.id, preset),
							'pp'
						]
					if (
						this.state.get([...propPath, 'id']) == feedback.options.memory
					) {
						if (feedback.options.unmodified === 2) return true
						const notModified = this.state.get([...propPath, 'isNotModified'])
						if (notModified == feedback.options.unmodified) {
							return true
						}
					}
				}
			}
			return false
		}

		return deviceScreenMemory
	}

	// MARK: deviceTake - Livepremier4
	get deviceTake() {
		const deviceTake = super.deviceTake

		deviceTake.callback = (feedback) => {
			if (this.choices.getChosenScreenAuxes(feedback.options.screens)
				.find((screen: string) => {
					return this.state.get(`DEVICE/device/screenAuxGroupList/items/${screen}/status/pp/transition`)?.match(/FROM/)
				})) return true			
			return false
		}

		return deviceTake
	}

	// MARK: deviceGpioOut - Livepremier4
	get deviceGpioOut() {

		let tooltip: string|undefined = undefined
		if (this.choices.getLinkedDevicesChoices().length) {
			tooltip = 'GPO number 1-8 for device #1'
			for (let device = 1; device < this.choices.getLinkedDevicesChoices().length; device+=1) {
				tooltip += `, ${device*8 +1}-${device*8 +8} for device #${device+1}`
			}
		} 

		const deviceGpioOut: AWJfeedback<{gpo: number, state: number }> = {
			type: 'boolean',
			name: 'Device - GPO State (LivePremier(≤V3)/LivePremier only)',
			sortName: '08 Device - 01 GPO State',
			description: 'Shows whether a general purpose output is currently active',
			defaultStyle: {
				color: this.config.color_dark,
				bgcolor: this.config.color_highlight,
			},
			options: [
				{
					id: 'gpo',
					type: 'number',
					label: 'GPO',
					min: 1,
					max: this.choices.getLinkedDevicesChoices().length * 8,
					range: true,
					default: 1,
					tooltip,
				},
				{
					id: 'state',
					type: 'dropdown',
					label: 'State',
					choices: [
						{ id: 0, label: 'GPO is off' },
						{ id: 1, label: 'GPO is on' },
					],
					default: 1,
				},
			],
			callback: (feedback) => {
				const gpo = Math.floor(feedback.options.gpo-1) % 8 +1
				const device = Math.ceil(feedback.options.gpo / 8)
				const val = feedback.options.state === 1 ? true : false
				return (
					this.state.get([
						'DEVICE',
						'device',
						'gpios',
						'deviceList', 'items', device.toString(),
						'gpoList', 'items', gpo.toString(),
						'status', 'pp', 'state',
					]) === val
				)
			},
		}

		return deviceGpioOut
	}

	// MARK: deviceGpioIn - Livepremier4
	get deviceGpioIn() {
		
		let tooltip: string|undefined = undefined
		if (this.choices.getLinkedDevicesChoices().length) {
			tooltip = 'GPI number 1-2 for device #1'
			for (let device = 1; device < this.choices.getLinkedDevicesChoices().length; device+=1) {
				tooltip += `, ${device*2 +1}-${device*2 +2} for device #${device+1}`
			}
		} 
		const deviceGpioIn: AWJfeedback<{gpi: number, state: number }> = {
			type: 'boolean',
			name: 'Device - GPI State (LivePremier(≤V3)/LivePremier only)',
			sortName: '08 Device - 02 GPI State',
			description: 'Shows whether a general purpose input is currently active',
			defaultStyle: {
				color: this.config.color_dark,
				bgcolor: this.config.color_highlight,
			},
			options: [
				{
					id: 'gpi',
					type: 'number',
					label: 'GPI',
					min: 1,
					max: this.choices.getLinkedDevicesChoices().length * 2,
					range: true,
					default: 1,
					step: 1,
					tooltip
				},
				{
					id: 'state',
					type: 'dropdown',
					label: 'State',
					choices: [
						{ id: 0, label: 'GPI is off' },
						{ id: 1, label: 'GPI is on' },
					],
					default: 1,
				},
			],
			callback: (feedback) => {
				const gpi = Math.floor((feedback.options.gpi-1) % 2 +1)
				const device = Math.ceil(feedback.options.gpi / 2)
				const val = feedback.options.state === 1 ? true : false
				return (
					this.state.get([
						'DEVICE',
						'device',
						'gpios',
						'deviceList', 'items', device.toString(),
						'gpiList', 'items', gpi.toString(),
						'status',
						'pp',
						'state',
					]) === val
				)
			},
		}

		return deviceGpioIn
	}

	/**
	 * MARK: Testpattern Active - LivePremier4
	 */
	get deviceTestpatternActive() {
		const options: CompanionInputFieldDropdown[] = [
			{
				id: 'group',
				type: 'dropdown',
				label: 'Group',
				choices: [
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
			},
		]

		return this.deviceTestpatternActive_common(options, 'LivePremier Testpattern Active')
	}

	/**
	 * MARK: Testpattern Raster Box Active - LivePremier4
	 */
	get deviceTestpatternRasterBoxActive() {
		return this.deviceTestpatternRasterBoxActive_common('LivePremier Testpattern Raster Box Active')
	}

	/**
	 * MARK: Audio - Routing Status - LivePremier4
	 * Mirrors "Audio - Route (Channels)" (deviceAudioRouteChannels action) - same option layout, same target
	 * resolution, and the same 'IN1C1IN1C2' Expression-Mode shorthand (choices.getChosenAudioInputChannels) for
	 * checking several channels at once. True only if every selected Input Channel is currently routed to its
	 * corresponding, consecutive Output Channel starting at the chosen first Output Channel. First draft:
	 * LivePremier4 only (Audio Routing's real id scheme/multi-device model is LP4-specific).
	 */
	get deviceAudioRouteChannelsStatus() {
		type DeviceAudioRouteChannelsStatus = {device: number, out1: string, in1: string}

		const devices = this.choices.getLinkedDevicesChoices().length
		const audioOutputChoices = Array.from({length: devices}, (_v, i) => this.choices.getAudioOutputChoices(i + 1))
		const audioInputChoices = Array.from({length: devices}, (_v, i) => this.choices.getAudioInputChoices(i + 1))

		const deviceAudioRouteChannelsStatus: AWJfeedback<DeviceAudioRouteChannelsStatus> = {
			type: 'boolean',
			name: 'Audio - Routing Status',
			sortName: '06 Audio - 01 Routing Status',
			description: 'Shows whether one or more Audio Input Channels are currently routed to the corresponding, consecutive Output Channels, starting at a given first Output Channel - mirrors "Audio - Route (Channels)".',
			defaultStyle: {
				color: this.config.color_dark,
				bgcolor: this.config.color_highlight,
			},
			options: [
				...(devices > 1 ? [{
					type: 'dropdown' as const,
					label: 'Device',
					id: 'device',
					choices: this.choices.getLinkedDevicesChoices(),
					default: 1,
					minChoicesForSearch: 3,
				}] : []),
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
						label: 'Input Channel(s)',
						id: `in${i+1}`,
						tooltip: 'To check several channels at once via Expression Mode, you can use a format like \'IN1C1IN1C2\' instead of the raw array form.',
						choices: choices,
						default: ['NONE'],
						minChoicesForSearch: 0,
						minSelection: 0,
						isVisibleExpression: `$(options:device) == ${i + 1}`,
						allowInvalidValues: true,
					}
				}),
			],
			callback: (feedback) => {
				const device = Number(feedback.options.device) || 1
				const inChannels = this.choices.getChosenAudioInputChannels(feedback.options[`in${device}`])
				if (inChannels.length === 0) return false
				const outChoices = audioOutputChoices[device - 1] ?? []
				const outstart = outChoices.findIndex((item) => item.id === feedback.options[`out${device}`])
				if (outstart === -1 || outstart + inChannels.length > outChoices.length) return false
				for (let s = 0; s < inChannels.length; s += 1) {
					const path = [
						'DEVICE', 'device', 'audio', 'control',
						'deviceList', 'items', device.toString(),
						'txList', 'items', outChoices[outstart + s].id.toString().split(':')[0],
						'channelList', 'items', outChoices[outstart + s].id.toString().split(':')[1],
						'control', 'pp', 'source',
					]
					if (this.state.get(path) !== inChannels[s]) return false
				}
				return true
			},
		}

		return deviceAudioRouteChannelsStatus
	}

	/**
	 * MARK: Audio - Block Routing Status - LivePremier4
	 * Mirrors "Audio - Route (Block)" (deviceAudioRouteBlock action) - same option layout and target resolution,
	 * including the "first Input Channel = NONE fills the whole Block with NONE" quirk. True only if every
	 * Output Channel in the Block is currently routed exactly as the block-route action would have set it.
	 * First draft: LivePremier4 only.
	 */
	get deviceAudioRouteBlockStatus() {
		type DeviceAudioRouteBlockStatus = {device: number, out1: string, in1: string, blocksize: number}

		const devices = this.choices.getLinkedDevicesChoices().length
		const audioOutputChoices = Array.from({length: devices}, (_v, i) => this.choices.getAudioOutputChoices(i + 1))
		const audioInputChoices = Array.from({length: devices}, (_v, i) => this.choices.getAudioInputChoices(i + 1))

		const deviceAudioRouteBlockStatus: AWJfeedback<DeviceAudioRouteBlockStatus> = {
			type: 'boolean',
			name: 'Audio - Block Routing Status',
			sortName: '06 Audio - 02 Block Routing Status',
			description: 'Shows whether a contiguous Block of Audio Output Channels (starting at a given first Output Channel, for the configured Block Size) is currently routed exactly to the corresponding, consecutive Input Channels starting at a given first Input Channel - mirrors "Audio - Route (Block)".',
			defaultStyle: {
				color: this.config.color_dark,
				bgcolor: this.config.color_highlight,
			},
			options: [
				...(devices > 1 ? [{
					type: 'dropdown' as const,
					label: 'Device',
					id: 'device',
					choices: this.choices.getLinkedDevicesChoices(),
					default: 1,
					minChoicesForSearch: 3,
				}] : []),
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
					tooltip: 'Capped at 8, matching "Audio - Route (Block)" - a block can never validly extend past the end of the 8-channel output block it starts in.',
					default: 8,
					min: 1,
					max: 8,
					range: true,
				},
			],
			callback: (feedback) => {
				const device = Number(feedback.options.device) || 1
				const outChoices = audioOutputChoices[device - 1] ?? []
				const inChoices = audioInputChoices[device - 1] ?? []
				const inValue = this.choices.getChosenAudioInputChannels(feedback.options[`in${device}`])[0]
				const outstart = outChoices.findIndex((item) => item.id === feedback.options[`out${device}`])
				const instart = inChoices.findIndex((item) => item.id === inValue)
				if (outstart === -1 || instart === -1) return false
				// Same output-block boundary clamp as the matching action - a block can never validly extend
				// past the end of the 8-channel output block it starts in, each output id is 'moduleId:channelNum'.
				const outChannelNum = parseInt(outChoices[outstart].id.toString().split(':')[1], 10)
				const remainingInOutputBlock = 8 - outChannelNum + 1
				const blocksize = Number(feedback.options.blocksize) || 1
				const max = Math.min(outChoices.length - outstart, inChoices.length - instart, blocksize, remainingInOutputBlock)
				if (max < blocksize) return false
				for (let s = 0; s < max; s += 1) {
					const path = [
						'DEVICE', 'device', 'audio', 'control',
						'deviceList', 'items', device.toString(),
						'txList', 'items', outChoices[outstart + s].id.toString().split(':')[0],
						'channelList', 'items', outChoices[outstart + s].id.toString().split(':')[1],
						'control', 'pp', 'source',
					]
					const expected = instart === 0 ? inChoices[0]?.id : inChoices[instart + s]?.id
					if (this.state.get(path) !== expected) return false
				}
				return true
			},
		}

		return deviceAudioRouteBlockStatus
	}

}
