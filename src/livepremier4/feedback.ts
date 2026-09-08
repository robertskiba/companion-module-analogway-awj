import Feedbacks from '../awjdevice/feedback.js'
import {AWJinstance} from '../index.js'
import {
	CompanionFeedbackDefinition,
	CompanionInputFieldDropdown,
	combineRgb,
} from '@companion-module/base'
import { stripMemoryPrefix } from '../util.js'


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
		'deviceLayerSourceStatus',
		'deviceLayerCutFillSourceStatus',
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
		'deviceOutputFreeze',
		'deviceInputSignalStatus',
		'deviceLayerSignalStatus',
		'deviceHealthStatus',
		'deviceConnectionStatus',
		'deviceScreenFreezeOutputs',
		'deviceLayerFreezeV3',
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
		'devicePreconfigBackgroundSetSourceStatus',
		'deviceInputKeyingStatus',
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
			const memory = stripMemoryPrefix(feedback.options.memory, 'SM')

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
						this.state.get([...propPath, 'id']) == memory
					) {
						if (feedback.options.unmodified === 2) return true
						// isNotModified is true when the memory is UNCHANGED - the "is Modified" option's 0/1
						// values mean the opposite ("only if unmodified"/"only if modified"), so the raw flag
						// has to be inverted before comparing (previously compared directly, which made both
						// choices show the opposite of what they claimed to check for).
						const modified = this.state.get([...propPath, 'isNotModified']) ? 0 : 1
						if (modified == feedback.options.unmodified) {
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
			name: 'Device - GPO State (Aquilon)',
			sortName: '07 Device - 01 GPO State',
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
			name: 'Device - GPI State (Aquilon)',
			sortName: '07 Device - 02 GPI State',
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
					{ id: 'HORIZONTAL_GRADIENT', label: 'Horizontal Gradient' },
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
					{ id: 'HORIZONTAL_GRADIENT', label: 'Horizontal Gradient' },
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
					{ id: 'HORIZONTAL_GRADIENT', label: 'Horizontal Gradient' },
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
		return this.deviceTestpatternRasterBoxActive_common('LivePremier Testpattern Raster Box Active (Aquilon)')
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
			sortName: '05 Audio - 01 Routing Status',
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
			sortName: '05 Audio - 02 Block Routing Status',
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

	/**
	 * MARK: deviceScreenFreeze (Aquilon) - emulated via Output Freeze
	 * Mirrors the matching action's override: "frozen" means every physical Output assigned to the
	 * Screen/Auxscreen is frozen (device/outputList/items/{n}/control/pp/freeze), the exact same live state
	 * "LIVE - Output Freeze" itself reads - so this reflects an output frozen individually just as much as one
	 * frozen via the collective action. True only if EVERY selected Screen/Auxscreen is (fully) frozen.
	 * Not a super.deviceScreenFreeze override - a fully independent implementation using the same "screens"
	 * single-dropdown + Expression Mode pattern as the matching action (see its own comment for why), instead
	 * of the base's native Companion multi-select + "Any Screen" keyword.
	 */
	get deviceScreenFreezeOutputs() {
		type DeviceScreenFreeze = {screens: string}

		const deviceScreenFreezeOutputs: AWJfeedback<DeviceScreenFreeze> = {
			type: 'boolean',
			name: 'LIVE - Screen Freeze (Aquilon)',
			sortName: '01 LIVE - 17 Freeze - Screen',
			description: 'Shows whether every physical Output assigned to the selected Screen(s)/Auxscreen(s) is frozen - true even if the outputs were frozen individually via "LIVE - Output Freeze" rather than through the collective action.',
			defaultStyle: {
				color: this.config.color_bright,
				bgcolor: combineRgb(0, 0, 100),
				png64:
					'iVBORw0KGgoAAAANSUhEUgAAADcAAAA3AQMAAACSFUAFAAABS2lUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4KPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNS42LWMxMzggNzkuMTU5ODI0LCAyMDE2LzA5LzE0LTAxOjA5OjAxICAgICAgICAiPgogPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4KICA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIi8+CiA8L3JkZjpSREY+CjwveDp4bXBtZXRhPgo8P3hwYWNrZXQgZW5kPSJyIj8+IEmuOgAAAARnQU1BAACxjwv8YQUAAAABc1JHQgCuzhzpAAAABlBMVEUAAABfXKLsUQDeAAAAAXRSTlMAQObYZgAAAM9JREFUGNONkTEOwjAMRX9UpDC1nIBwEKRyJCMGmNogDsCRyMY1wg26ESTUYLc1sEGWp1h2/vcPABDG84MrWoxXOgxcUycol7tbEFb748Aim4HmKZyXSCZsUFpQwQ1OeIqorsxzQHFnXgCTmT3PtczErD1ZEXCBXJR6RzXXzSNR3wA2NrvkPCpf52gDZnDZw3Oj7Ue/xfObM9gMSL/LgfttbHPH8+bRb+U9tIla0XVx1FP9yY/6U7/qX/fR/XRf3f+Th+Yz5aX5vfPUfP/6jxdhImTMvNrBOgAAAABJRU5ErkJggg==',
			},
			options: [
				{
					id: 'screens',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screens / Auxscreens',
					tooltip: 'To check multiple specific screens other than "All Screens" or "Selected Screens", switch to Expression Mode and use a format like \'S1S2A1\' (in quotes, so it is recognized as text).',
					choices: [
						{ id: 'all', label: 'All Screens' },
						{ id: 'sel', label: 'Selected Screens' },
						...this.choices.getScreenAuxChoices(),
					],
					default: 'sel',
				},
			],
			callback: (feedback) => {
				const isFrozen = (screen: string): boolean => {
					const outputs = this.choices.getScreenOutputArray(screen)
					return outputs.length > 0 && outputs.every((out) => !!this.state.get(['DEVICE', 'device', 'outputList', 'items', out.id, 'control', 'pp', 'freeze']))
				}
				const screens = this.choices.getChosenScreenAuxes(feedback.options.screens)
				return screens.length > 0 && screens.every(isFrozen)
			},
		}
		return deviceScreenFreezeOutputs
	}

	/**
	 * MARK: deviceLayerFreezeV3 (Aquilon)
	 * Mirrors the matching action's design and comment (Screen/Preset/Layer fields, Aux screens filtered out
	 * and ignored, 'UP'/'DOWN' physical-bank tokens resolved live via getPreset()/presetUp). True only if
	 * EVERY resolved Layer has EVERY requested Preset direction's token present in its freeze array -
	 * consistent with "LIVE - Screen Freeze"'s AND-across-targets semantics.
	 */
	get deviceLayerFreezeV3() {
		type DeviceLayerFreezeV3 = {screen: string, preset: string, layersel: string}

		const resolveScreens = (screen: string): string[] => {
			const targets = screen === 'first'
				? this.choices.getSelectedScreens()
				: this.choices.getChosenScreenAuxes(screen)
			const realScreens = targets.filter((s) => s.startsWith('S'))
			return screen === 'first' ? realScreens.slice(0, 1) : realScreens
		}

		const resolveLayers = (opt: {screen: string, layersel: string}): {screenAuxKey: string, layerKey: string}[] => {
			const targetScreens = resolveScreens(opt.screen)
			if (opt.layersel === 'sel') return this.choices.getSelectedLayers().filter((layer) => targetScreens.includes(layer.screenAuxKey))
			if (opt.layersel === 'first') return this.choices.getSelectedLayers().filter((layer) => targetScreens.includes(layer.screenAuxKey)).slice(0, 1)
			if (opt.layersel === 'all') return targetScreens.flatMap((screenAuxKey) => this.choices.getLayersAsArray(screenAuxKey, false).map((l) => ({ screenAuxKey, layerKey: l.id })))
			// Expression Mode also accepts a concatenated multi-Layer string like 'L1L2' (getChosenLayers() -
			// same convention as "LIVE - Layer Selection" elsewhere in the module); a plain numeric value from
			// the dropdown itself passes through unchanged.
			const layerKeys = this.choices.getChosenLayers(opt.layersel)
			// Only ever consider a Layer that actually exists on that specific Screen right now - matches the
			// action's own guard (see its comment for why), and keeps the feedback's own semantics well-defined
			// for a nonexistent Layer number (treated as not part of the target set, same as "all" already
			// only resolves to real Layers, rather than reading/reporting on a meaningless path).
			return targetScreens.flatMap((screenAuxKey) => {
				const realIds = new Set(this.choices.getLayersAsArray(screenAuxKey, false).map((l) => l.id))
				return layerKeys.filter((layerKey) => realIds.has(layerKey)).map((layerKey) => ({ screenAuxKey, layerKey }))
			})
		}

		const getFreezeToken = (screen: string, preset: 'pgm' | 'pvw'): 'UP' | 'DOWN' => {
			const bank = this.choices.getPreset(screen, preset)
			const presetUp = this.state.get(['DEVICE', ...this.constants.screenGroupPath, 'items', screen, 'control', 'pp', 'presetUp'])
			return bank === presetUp ? 'UP' : 'DOWN'
		}

		const deviceLayerFreezeV3: AWJfeedback<DeviceLayerFreezeV3> = {
			type: 'boolean',
			name: 'LIVE - Layer Freeze (Aquilon)',
			sortName: '01 LIVE - 16 Freeze - Layer',
			description: 'Shows whether a Layer\'s Program and/or Preview content is currently frozen. Aquilon only supports this on real Screens, never Auxscreens.',
			defaultStyle: {
				color: this.config.color_bright,
				bgcolor: combineRgb(0, 0, 100),
				png64:
					'iVBORw0KGgoAAAANSUhEUgAAADcAAAA3AQMAAACSFUAFAAABS2lUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4KPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNS42LWMxMzggNzkuMTU5ODI0LCAyMDE2LzA5LzE0LTAxOjA5OjAxICAgICAgICAiPgogPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4KICA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIi8+CiA8L3JkZjpSREY+CjwveDp4bXBtZXRhPgo8P3hwYWNrZXQgZW5kPSJyIj8+IEmuOgAAAARnQU1BAACxjwv8YQUAAAABc1JHQgCuzhzpAAAABlBMVEUAAABfXKLsUQDeAAAAAXRSTlMAQObYZgAAAM9JREFUGNONkTEOwjAMRX9UpDC1nIBwEKRyJCMGmNogDsCRyMY1wg26ESTUYLc1sEGWp1h2/vcPABDG84MrWoxXOgxcUycol7tbEFb748Aim4HmKZyXSCZsUFpQwQ1OeIqorsxzQHFnXgCTmT3PtczErD1ZEXCBXJR6RzXXzSNR3wA2NrvkPCpf52gDZnDZw3Oj7Ue/xfObM9gMSL/LgfttbHPH8+bRb+U9tIla0XVx1FP9yY/6U7/qX/fR/XRf3f+Th+Yz5aX5vfPUfP/6jxdhImTMvNrBOgAAAABJRU5ErkJggg==',
			},
			options: [
				{
					id: 'screen',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screen',
					choices: [{ id: 'first', label: 'First/Only Selected Screen' }, { id: 'all', label: 'All Screens' }, { id: 'sel', label: 'Selected Screens' }, ...this.choices.getScreenChoices()],
					default: 'first',
				},
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset (Program/Preview)',
					choices: [...this.choices.choicesPreset, { id: 'all', label: 'Both (Preview/Program)' }],
					allowInvalidValues: true,
					default: 'prw',
				},
				{
					id: 'layersel',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Layer',
					tooltip: 'To check multiple specific Layers other than "All Layers" or "All Selected Layers", switch to Expression Mode and use a format like \'L1L2\' (in quotes, so it is recognized as text).',
					choices: [{ id: 'first', label: 'First/Only Selected Layer' }, { id: 'all', label: 'All Layers' }, { id: 'sel', label: 'All Selected Layers' }, ...Array.from({ length: this.choices.getMaxConfiguredLayerCount() }, (_i, e: number) => ({ id: (e + 1).toString(), label: `Layer ${e + 1}` }))],
					default: 'first',
				},
			],
			callback: (feedback) => {
				const presetTargets: ('pgm' | 'pvw')[] = feedback.options.preset === 'all' ? ['pgm', 'pvw'] : [feedback.options.preset as 'pgm' | 'pvw']
				const layers = resolveLayers(feedback.options)
				if (layers.length === 0) return false
				return layers.every((layer) => {
					const current: string[] = this.state.get(['DEVICE', 'device', 'screenList', 'items', layer.screenAuxKey, 'layerList', 'items', layer.layerKey, 'control', 'pp', 'freeze']) ?? []
					return presetTargets.every((preset) => current.includes(getFreezeToken(layer.screenAuxKey, preset)))
				})
			},
		}

		return deviceLayerFreezeV3
	}

}
