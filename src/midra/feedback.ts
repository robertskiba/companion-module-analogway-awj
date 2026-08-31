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

export default class FeedbacksMidra extends Feedbacks  {

	readonly feedbacksToUse = [		
		'syncselection',
		'presetToggle',
		'globalAnchorPoint',
		'deviceLayerPropertyStatus',
		'deviceMasterMemory',
		'deviceScreenMemory',
		'deviceScreenMemorySlotStatus',
		'deviceAuxMemory',
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
		'deviceLayerFreeze',
		'deviceScreenFreeze',
		'timerState',
		// 'deviceGpioOut',
		// 'deviceGpioIn',
		'deviceStreaming',
		'deviceStreamAudioMuteStatus',
		'deviceInputPlugStatus',
		'deviceAudioRouteChannelsStatus',
		'deviceAudioRouteBlockStatus',
		'deviceTestpatternActive',
		'deviceCustom',
		'deviceThumbnail',
		// 'deviceBackupSetSourceStatus', // Backup does not exist on Midra/Alta, same as the corresponding actions
		// 'deviceBackupAutoModeStatus',
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
				label: 'Screens',
				choices: [{ id: 'all', label: 'Any Screen' }, ...this.choices.getScreenChoices()],
				multiple: true,
				tags: true,
				regex: '/^S([1-9]|[1-3][0-9]|4[0-8])$/',
				default: ['all'],
				allowInvalidValues: true,
			} as any // TODO: fix type of dropdown with multiple: true property

		return deviceScreenMemory
	}

	// MARK: deviceSourceTally
	get deviceSourceTally() {
		const deviceSourceTally = super.deviceSourceTally

		deviceSourceTally.callback = (feedback) => {  
			const checkTally = (): boolean => {
				// go thru the screens
				for (const screen of this.choices.getChosenScreenAuxes(feedback.options.screens)) {
					const screeninfo = this.choices.getScreenInfo(screen)
					const preset = this.choices.getPreset(screen, feedback.options.preset)
					for (const layer of this.choices.getLayerChoices(screen)) {
						const screenpath = [
							'DEVICE',
							...(screeninfo.isAux ? this.constants.auxPath : this.constants.screenPath),
							'items',
							screeninfo.numstr
						]
						const presetpath = [...screenpath, 'presetList', 'items', preset]
						
						// check if source is used in background set on a screen
						if (layer.id === 'BG' && screeninfo.isScreen) {
							const set = this.state.get([...presetpath, 'background', 'source', 'pp', 'set'])
							if (set === 'NONE') continue
							const setinput = this.state.get([...screenpath, 'backgroundSetList', 'items', set, 'control', 'pp', 'singleContent']) // TODO: check input format
							if (setinput === feedback.options.source) return true
							else continue
						}

						// check if source is used in background layer on a aux
						else if (layer.id === 'BG' && screeninfo.isAux) {
							const bkginput = this.state.get([...presetpath, 'background', 'source', 'pp', 'content'])
							if (bkginput === feedback.options.source) return true
							else continue
						}
	
						// check if source is used in top layer
						else if (layer.id === 'TOP') {
							const frginput = this.state.get([...presetpath, 'top', 'source', 'pp', 'frame'])
							if (frginput === feedback.options.source) return true
							else continue
						}
						
						if ((feedback.options.source === 'NONE' || feedback.options.source?.toString().startsWith('BACKGROUND') && this.state.get([...presetpath, 'source', 'pp', 'inputNum']) === feedback.options.source)) {
							return true
						}
						
						const layerpath = [...presetpath, 'liveLayerList', 'items', layer.id]
						if (this.state.get([...layerpath, 'source', 'pp', 'input']) === feedback.options.source) {
							const invisible = (
								this.state.get([...layerpath, 'size', 'pp', 'sizeH']) === 0 ||
								this.state.get([...layerpath, 'size', 'pp', 'sizeV']) === 0 ||
								this.state.get([...layerpath, 'opacity', 'pp', 'opacity']) === 0 ||
								this.state.get([...layerpath, 'crop', 'pp', 'top']) +
									this.state.get([...layerpath,'crop', 'pp', 'bottom']) >
									65528 ||
								this.state.get([...layerpath, 'crop', 'pp', 'left']) +
									this.state.get([...layerpath, 'crop', 'pp', 'right']) >
									65528 ||
								this.state.get([...layerpath, 'mask', 'pp', 'top']) +
									this.state.get([...layerpath, 'mask', 'pp', 'bottom']) >
									65528 ||
								this.state.get([...layerpath, 'mask', 'pp', 'left']) +
									this.state.get([...layerpath, 'mask', 'pp', 'right']) >
									65528 ||
								this.state.get([...layerpath, 'position', 'pp', 'posH']) + this.state.get([...layerpath, 'size', 'pp', 'sizeH']) / 2 <= 0 ||
								this.state.get([...layerpath, 'position', 'pp', 'posV']) + this.state.get([...layerpath, 'size', 'pp', 'sizeV']) / 2 <= 0 ||
								this.state.get([...layerpath, 'position', 'pp', 'posH']) - this.state.get([...layerpath, 'size', 'pp', 'sizeH']) / 2 >=
									this.state.get([...screenpath, 'canvas', 'status', 'size', 'pp', 'sizeH']) ||
								this.state.get([...layerpath, 'position', 'pp', 'posV']) - this.state.get([...layerpath, 'size', 'pp', 'sizeV']) / 2 >=
									this.state.get([...screenpath, 'canvas', 'status', 'size', 'pp', 'sizeV'])
							)
							if (!invisible) {
								return true
							}
						}
					}
				}
				return false
			}

			const tally = checkTally()
			const sortedScreens = [...feedback.options.screens].sort()
			const varName = `tally_${sortedScreens.join('-')}_${feedback.options.preset}_${feedback.options.source}`
			let varValue = '0'
			if (tally) {
				varValue = '1'
			} else {
				varValue = '0'
			}
			if (varValue != this.instance.getVariableValue(varName)) {
				this.instance.setVariableValues({ [varName]: varValue })
			}
			return tally
		}

		return deviceSourceTally
	}

	// MARK: deviceTake - Midra
	get deviceTake() {
		const deviceTake = super.deviceTake

		deviceTake.callback = (feedback) => {
			if (this.choices.getChosenScreenAuxes(feedback.options.screens)
				.find((screen: string) => {
					const screeninfo = this.choices.getScreenInfo(screen)
					return this.state.get([
						'DEVICE', 
						...(screeninfo.isAux ? this.constants.auxGroupPath : this.constants.screenGroupPath),
						'items', screeninfo.numstr,
						'status', 'pp', 'transition'
					])?.match(/FROM/)
				})) return true			
			return false
		}

		return deviceTake
	}

	// MARK: remoteWidgetSelection
	get remoteWidgetSelection() {
		const remoteWidgetSelection = super.remoteWidgetSelection

		remoteWidgetSelection.callback = (feedback) => {
			const widget = feedback.options.widget?.toString().split(':')[1] ?? '0'
			let widgetSelection: {widgetKey: string, mocOutputLogicKey: string}[] = []
			if (this.state.syncSelection) {
				widgetSelection = [
					...(this.state.get('REMOTE/live/multiviewer/widgetSelection/widgetKeys') ?? [])
					.map((key: string) => {return {widgetKey: key, mocOutputLogicKey: '1'}})
				]
			} else {
				widgetSelection = this.state.get('LOCAL/widgetSelection/widgetIds') ?? []
			}
			return JSON.stringify(widgetSelection).includes(`{"widgetKey":"${widget}","mocOutputLogicKey":"1"}`)
		}

		return remoteWidgetSelection
	}

	// MARK: deviceInputFreeze
	get deviceInputFreeze() {
		const deviceInputFreeze = super.deviceInputFreeze

		deviceInputFreeze.callback = (feedback) => {
			const input = feedback.options.input?.toString().replace('LIVE', 'INPUT') || ''
			const freeze = this.state.get('DEVICE/device/inputList/items/' + input + '/control/pp/freeze')
			if (freeze) {
				this.instance.setVariableValues({ ['frozen_' + input]: '*'})
			} else {
				this.instance.setVariableValues({ ['frozen_' + input]: ' '})
			}
			return freeze
		}

		return deviceInputFreeze
	}

	// MARK: deviceStreaming - Midra
	get deviceStreaming() {
		
		const deviceStreaming: AWJfeedback<{state: string}> = {
			type: 'boolean',
			name: 'LIVE - Stream Running State (Midra only)',
			sortName: '01 LIVE - 11 Stream Running State',
			description: 'Shows status of streaming',
			defaultStyle: {
				color: this.config.color_dark,
				bgcolor: this.config.color_highlight,
			},
			options: [
				{
					id: 'state',
					type: 'dropdown',
					label: 'State',
					choices: [
						{ id: 'NONE', label: 'Stream is off' },
						{ id: 'LIVE', label: 'Stream is on' },
					],
					default: 'LIVE',
				},
			],
			callback: (feedback) => {
				return (
					this.state.get([
						'DEVICE',
						'device',
						'streaming',
						'status',
						'pp',
						'mode',
					]) === feedback.options.state
				)
			},
		}

		return deviceStreaming
	}

	/**
	 * MARK: deviceStreamAudioMuteStatus - Midra
	 * No distinct status path exists for this field (unlike the stream on/off master switch, which has a real
	 * device/streaming/status/pp/mode) - the deviceStreamAudioMute action's own toggle logic already reads this
	 * exact control path back to compute its next state, confirming it reflects the live current value.
	 */
	get deviceStreamAudioMuteStatus() {
		type DeviceStreamAudioMuteStatus = { muted: boolean }

		const deviceStreamAudioMuteStatus: AWJfeedback<DeviceStreamAudioMuteStatus> = {
			type: 'boolean',
			name: 'LIVE - Stream Audio Mute Status (Midra only)',
			sortName: '01 LIVE - 14 Stream Audio Mute Status',
			description: 'Shows whether the streaming output\'s audio is currently muted.',
			defaultStyle: {
				color: this.config.color_dark,
				bgcolor: this.config.color_highlight,
			},
			options: [],
			callback: () => {
				return !!this.state.get('DEVICE/device/streaming/control/audio/live/pp/mute')
			},
		}

		return deviceStreamAudioMuteStatus
	}

	/**
	 * MARK: Testpattern Active - Midra
	 */
	get deviceTestpatternActive() {
		const options: CompanionInputFieldDropdown[] = [
			{
				id: 'group',
				type: 'dropdown',
				label: 'Group',
				choices: [
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
			},
		]

		return this.deviceTestpatternActive_common(options, 'Midra 4K Testpattern Active')
	}

	/**
	 * MARK: deviceInputPlugStatus - Midra
	 * Mirrors deviceInputPlug's own field construction (only inputs with more than one available plug get a
	 * choice at all). status/pp/plug is already read elsewhere in this module (choices.ts' input-signal-status
	 * helper) as the input's currently active plug.
	 */
	get deviceInputPlugStatus() {
		type DeviceInputPlugStatus = Record<string, string>

		const multiPlugInputs = this.choices.getLiveInputArray().filter((input) => this.choices.getPlugChoices(input.id).length > 1)

		const deviceInputPlugStatus: AWJfeedback<DeviceInputPlugStatus> = {
			type: 'boolean',
			name: 'Preconfig - Input Plug Status (Midra only)',
			sortName: '07 Preconfig - 02 Input Plug Status',
			description: 'Shows which physical plug is currently active for an Input.',
			defaultStyle: {
				color: this.config.color_dark,
				bgcolor: this.config.color_highlight,
			},
			options: [
				{
					id: 'input',
					type: 'dropdown',
					label: 'Input',
					choices: multiPlugInputs.map((input) => ({
						id: input.id,
						label: 'Input ' + input.index + (input.label.length ? ' - ' + input.label : ''),
					})),
					default: multiPlugInputs[0]?.id ?? '',
					disableAutoExpression: true,
				},
				...multiPlugInputs.map((input) => {
					const plugs = this.choices.getPlugChoices(input.id)
					return {
						id: `plugs${input.id}`,
						type: 'dropdown' as const,
						label: 'Plug',
						choices: plugs,
						default: plugs[0].id,
						isVisibleExpression: `$(options:input) == '${input.id}'`,
					}
				}),
			],
			callback: (feedback) => {
				const input = feedback.options.input
				const expected = feedback.options[`plugs${input}`]
				return this.state.get(['DEVICE', 'device', 'inputList', 'items', input, 'status', 'pp', 'plug']) === expected
			},
		}

		return deviceInputPlugStatus
	}

	/**
	 * MARK: Audio - Routing Status - Midra
	 * Mirrors "Audio - Route (Channels)" (deviceAudioRouteChannels action) - same option layout and target
	 * resolution, and the same 'IN1C1IN1C2' Expression-Mode shorthand (choices.getChosenAudioInputChannels) for
	 * checking several channels at once. True only if every selected Input Channel is currently routed to its
	 * corresponding, consecutive Output Channel starting at the chosen first Output Channel. Unlike LivePremier/
	 * LivePremier4 (a per-channel 'control/pp/source' field), Midra's audio routing is a single array field per
	 * Custom Block ('custom/sourceList/items/{block}/control/pp/channelMapping'), so the check reads that array
	 * and compares the element at the target channel's index (0-based).
	 */
	get deviceAudioRouteChannelsStatus() {
		type DeviceAudioRouteChannelsStatus = {out1: string, in1: string}

		const audioOutputChoices = this.choices.getAudioCustomBlockChoices()
		const audioInputChoices = this.choices.getAudioInputChoices()

		const deviceAudioRouteChannelsStatus: AWJfeedback<DeviceAudioRouteChannelsStatus> = {
			type: 'boolean',
			name: 'Audio - Routing Status',
			sortName: '06 Audio - 01 Routing Status',
			description: 'Shows whether one or more Audio Input Channels are currently routed to the corresponding, consecutive Custom Block Output Channels, starting at a given first Output Channel - mirrors "Audio - Route (Channels)".',
			defaultStyle: {
				color: this.config.color_dark,
				bgcolor: this.config.color_highlight,
			},
			options: [
				{
					type: 'dropdown',
					label: 'First Output Channel',
					id: 'out1',
					choices: audioOutputChoices,
					default: audioOutputChoices[0]?.id,
					minChoicesForSearch: 0,
					allowInvalidValues: true,
				},
				{
					type: 'multidropdown',
					label: 'Input Channel(s)',
					id: 'in1',
					tooltip: 'To check several channels at once via Expression Mode, you can use a format like \'IN1C1IN1C2\' instead of the raw array form.',
					choices: audioInputChoices,
					default: ['NONE'],
					minChoicesForSearch: 0,
					minSelection: 0,
					allowInvalidValues: true,
				},
			],
			callback: (feedback) => {
				const inChannels = this.choices.getChosenAudioInputChannels(feedback.options.in1)
				if (inChannels.length === 0) return false
				const outstart = audioOutputChoices.findIndex((item) => item.id === feedback.options.out1)
				if (outstart === -1 || outstart + inChannels.length > audioOutputChoices.length) return false
				for (let s = 0; s < inChannels.length; s += 1) {
					const sink = audioOutputChoices[outstart + s].id.toString()
					const block = sink.split(':')[0]
					const channel = parseInt(sink.split(':')[1], 10)
					const mapping: string[] = this.state.get(['DEVICE', 'device', 'audio', 'custom', 'sourceList', 'items', block, 'control', 'pp', 'channelMapping']) ?? []
					if (mapping[channel - 1] !== inChannels[s]) return false
				}
				return true
			},
		}

		return deviceAudioRouteChannelsStatus
	}

	/**
	 * MARK: Audio - Block Routing Status - Midra
	 * Mirrors "Audio - Route (Block)" (deviceAudioRouteBlock action) - same option layout and target resolution,
	 * including the "first Input Channel = NONE fills the whole Block with NONE" quirk. True only if every
	 * Output Channel in the Block is currently routed exactly as the block-route action would have set it.
	 */
	get deviceAudioRouteBlockStatus() {
		type DeviceAudioRouteBlockStatus = {out1: string, in1: string, blocksize: number}

		const audioOutputChoices = this.choices.getAudioCustomBlockChoices()
		const audioInputChoices = this.choices.getAudioInputChoices()

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
				{
					type: 'dropdown',
					label: 'First Output Channel',
					id: 'out1',
					choices: audioOutputChoices,
					default: audioOutputChoices[0]?.id,
					minChoicesForSearch: 0,
					allowInvalidValues: true,
				},
				{
					type: 'dropdown',
					label: 'First Input Channel',
					id: 'in1',
					tooltip: 'Via Expression Mode you can also use a format like \'IN1C1\' instead of the raw id.',
					choices: audioInputChoices,
					default: audioInputChoices[0]?.id,
					minChoicesForSearch: 0,
					allowInvalidValues: true,
				},
				{
					type: 'number',
					label: 'Block Size',
					id: 'blocksize',
					tooltip: 'Capped at 8, matching "Audio - Route (Block)" - a block can never validly extend past the end of the 8-channel Custom Block it starts in.',
					default: 8,
					min: 1,
					max: 8,
					range: true,
				},
			],
			callback: (feedback) => {
				const inValue = this.choices.getChosenAudioInputChannels(feedback.options.in1)[0]
				const outstart = audioOutputChoices.findIndex((item) => item.id === feedback.options.out1)
				const instart = audioInputChoices.findIndex((item) => item.id === inValue)
				if (outstart === -1 || instart === -1) return false
				// Same output-block boundary clamp as the matching action - a block can never validly extend
				// past the end of the 8-channel Custom Block it starts in, each output id is 'CUSTOM_n:channelNum'.
				const outChannelNum = parseInt(audioOutputChoices[outstart].id.toString().split(':')[1], 10)
				const remainingInOutputBlock = 8 - outChannelNum + 1
				const blocksize = Number(feedback.options.blocksize) || 1
				const max = Math.min(audioOutputChoices.length - outstart, audioInputChoices.length - instart, blocksize, remainingInOutputBlock)
				if (max < blocksize) return false
				for (let s = 0; s < max; s += 1) {
					const sink = audioOutputChoices[outstart + s].id.toString()
					const block = sink.split(':')[0]
					const channel = parseInt(sink.split(':')[1], 10)
					const mapping: string[] = this.state.get(['DEVICE', 'device', 'audio', 'custom', 'sourceList', 'items', block, 'control', 'pp', 'channelMapping']) ?? []
					const expected = instart === 0 ? audioInputChoices[0]?.id : audioInputChoices[instart + s]?.id
					if (mapping[channel - 1] !== expected) return false
				}
				return true
			},
		}

		return deviceAudioRouteBlockStatus
	}

}
