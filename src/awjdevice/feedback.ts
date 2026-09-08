import { Config } from '../config.js'
import {AWJinstance, regexAWJpath} from '../index.js'
import { StateMachine } from '../state.js'
import Choices, {Choicemeta} from './choices.js'
import {
	combineRgb,
	CompanionAdvancedFeedbackDefinition,
	CompanionAdvancedFeedbackResult,
	CompanionBooleanFeedbackDefinition,
	CompanionFeedbackBooleanEvent,
	CompanionFeedbackDefinition,
	CompanionFeedbackDefinitions,
	CompanionInputFieldDropdown,
	InstanceStatus,
} from '@companion-module/base'
import Constants from './constants.js'
import { parseBoolean, stripMemoryPrefix } from '../util.js'


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

export default class Feedbacks {
	protected instance: AWJinstance
	protected state: StateMachine
	protected choices: Choices
	protected config: Config
	protected constants: typeof Constants

	/** Shared thumbnail snapshot pollers, keyed by `${source}:${item}` so multiple buttons watching the same
	 *  source share one HTTP poll (the device caps snapshot requests at 1/second per item, see deviceThumbnail).
	 *  Deliberately instance fields, not locals inside the deviceThumbnail getter - that getter re-runs on every
	 *  updateInstance() (e.g. a config color change), which would otherwise orphan any already-running timers.
	 *  `activeRate` is what the timer actually runs at once the global throttle (recalculateThumbnailThrottle)
	 *  has been applied - it can be slower than every subscriber's own requested rate, never faster.
	 *  Each subscriber's `lastSeen` exists to detect and self-clean up subscribers that came from Companion
	 *  rendering an 'advanced' feedback's preset-browser preview rather than a real placed button (confirmed
	 *  live: Companion runs the callback once to render a preset preview, since 'advanced' feedbacks have no
	 *  static defaultStyle fallback the way 'boolean' ones do to preview without executing anything) - a real
	 *  placed button keeps renewing its own `lastSeen` forever via its own poll -> checkFeedbacksById -> callback
	 *  cycle, while a one-off preview never gets called again and ages out, see pollThumbnail. */
	private thumbnailPollers = new Map<string, {
		timer: ReturnType<typeof setInterval> | null
		activeRate: number
		busy: boolean
		subscribers: Map<string, { rate: number, lastSeen: number }>
		source: 'inputs' | 'outputs' | 'imagesStore' | 'timers'
		itemId: string
	}>()
	private thumbnailFeedbackKey = new Map<string, string>()
	private thumbnailCache = new Map<string, string>()
	/** How long a subscriber may go without renewing itself (see comment above) before being treated as a
	 *  stale/one-off preview and dropped - always at least this floor, or 3x its own requested rate, whichever
	 *  is larger, so a real button with a long Refresh Rate never gets mistakenly reaped. */
	private readonly thumbnailSubscriberTtlMs = 60_000
	/** Above this many distinct polls running at once, the global throttle in recalculateThumbnailThrottle
	 *  starts stretching every poller's interval so the combined request rate stays near this same number
	 *  (e.g. 32 distinct thumbnails end up polling every ~2s each instead of every 1s) - keeps a "thumbnail
	 *  wall" page from silently turning into dozens of requests/second to the device and dozens of button
	 *  re-renders/second in Companion. A single button's own Refresh Rate is always honored as a minimum
	 *  (never polled faster than requested), only ever slowed down further. */
	private readonly thumbnailThrottleThreshold = 16

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
		'deviceInputSignalStatus',
		'deviceLayerSignalStatus',
		'deviceHealthStatus',
		'deviceConnectionStatus',
		// 'deviceLayerFreeze',
		// 'deviceScreenFreeze',
		'timerState',
		'deviceGpioOut',
		'deviceGpioIn',
		// 'deviceStreaming',
		'deviceCustom',
		'deviceThumbnail',
	]

	constructor (instance: AWJinstance) {
		this.instance = instance
		this.state = this.instance.state
		this.choices = this.instance.choices
		this.config = this.instance.config
		this.constants = this.instance.constants
	}

	/**
	 * Object with all exported feedback definitions
	 */
	get allFeedbacks() {
		const feedbackDefinitions: CompanionFeedbackDefinitions = Object.fromEntries(
            this.feedbacksToUse.map((key) => [key, this[key]])
        )
        
        return feedbackDefinitions
	}

	// MARK: syncselection
	get syncselection()  {
		
		const syncselection: CompanionBooleanFeedbackDefinition = {
			type: 'boolean',
			name: 'Device - Synchronization of the selection',
			sortName: '07 Device - 05 Synchronization of the selection',
			description: 'Shows whether this client synchronizes its selection to the device',
			defaultStyle: {
				color: this.config.color_dark,
				bgcolor: this.config.color_highlight,
			},
			options: [],
			callback: (_feedback) => {
				const clients = this.state.get('REMOTE/system/network/websocketServer/clients')
				if (clients === undefined || Array.isArray(clients) === false) return false
				const myid: string = this.state.get('LOCAL/socketId')
				const myindex = clients.findIndex((elem) => {
					if (elem.id === myid) {
						return true
					} else {
						return false
					}
				})
				if (this.state.get(`REMOTE/system/network/websocketServer/clients/${myindex}/isRemoteSelectionEnabled`)) {
					return true
				} else {
					return false
				}
			},
		}

		return syncselection
	}

	// MARK: preset toggle
	get presetToggle()  {
		
		const presetToggle: CompanionBooleanFeedbackDefinition = {
			type: 'boolean',
			name: 'LIVE - Preset Toggle Status (Program/Preview)',
			sortName: '01 LIVE - 01 Preset Toggle Status (Program/Preview)',
			description: 'Shows whether preset toggle is on or off',
			defaultStyle: {
				color: this.config.color_dark,
				bgcolor: this.config.color_highlight,
			},
			options: [],
			callback: (_feedback) => {
				return this.state.get(['DEVICE', ...this.constants.presetTogglePath]) === this.constants.presetToggleValueValid
			},
		}

		return presetToggle
	}

	// MARK: Global Anchor Point
	get globalAnchorPoint()  {

		const globalAnchorPoint: CompanionBooleanFeedbackDefinition = {
			type: 'boolean',
			name: 'Layer Properties - Global Anchor Point',
			sortName: '03 Layer Properties - Global Anchor Point',
			description: 'Shows whether the given Anchor Point is the currently globally selected one (the same value WebRCS uses)',
			defaultStyle: {
				color: this.config.color_bright,
				bgcolor: this.config.color_highlight,
			},
			options: [
				{
					id: 'anchor',
					type: 'dropdown',
					label: 'Anchor Point',
					choices: this.choices.getAnchorPointChoices(),
					default: 'CENTER',
				},
			],
			callback: (feedback) => {
				return feedback.options.anchor === this.choices.getGlobalAnchorPoint()
			},
		}

		return globalAnchorPoint
	}

	/**
	 * MARK: deviceLayerPropertyStatus
	 * One combined feedback (dropdown-selected property) for every on/off-style Layer Properties setting, per
	 * explicit user request rather than a separate feedback per property. Covers Border (Edge/Shadow enable +
	 * Round/Smooth), Effects (Filter/Transform/Strobe flags), Keying enable, and Mask - Mask has no real on/off
	 * flag in the protocol (purely 4 continuous crop fraction values, 0 = no crop), so "Mask Active" is inferred
	 * as "any of the 4 crop values is non-zero", per explicit user request. All paths/flag vocabularies confirmed
	 * from the corresponding V3 actions' own `learn` (Get current values) handlers, which already read these
	 * exact same fields live.
	 */
	get deviceLayerPropertyStatus() {
		type DeviceLayerPropertyStatus = { screen: string, preset: string, layer: string, property: string }

		const deviceLayerPropertyStatus: AWJfeedback<DeviceLayerPropertyStatus> = {
			type: 'boolean',
			name: 'Layer Properties - Property Status',
			sortName: '03 Layer Properties - 10 Property Status',
			description: 'Shows whether a given on/off-style Layer Property (Border, Effects/Filter/Transform/Strobe, Keying, Cut&Fill Enable, Mask, Aspect Override, Transitions) is currently active on a Layer. See "Layer Properties - Layer Source"/"Layer Properties - Cut&Fill Source" for checking a specific Source value rather than just on/off. The two "Allow Cross Effect/Depth" properties mirror an action whose flags mapping is not yet confirmed live - see that action\'s own description.',
			defaultStyle: {
				color: this.config.color_dark,
				bgcolor: this.config.color_highlight,
			},
			options: [
				{
					id: 'screen',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screen / Aux',
					choices: this.choices.getScreenAuxChoices(),
					default: this.choices.getScreenAuxChoices()[0]?.id,
				},
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset (Program/Preview)',
					tooltip: '"Both (AND)" is true only if the checked property currently matches on both Program and Preview at once. "Both (OR)" is true if it matches on either.',
					choices: [{ id: 'sel', label: 'Selected' }, ...this.choices.choicesPreset, { id: 'both_and', label: 'Both (Preview AND Program)' }, { id: 'both_or', label: 'Both (Preview OR Program)' }],
					allowInvalidValues: true,
					default: 'sel',
				},
				{
					id: 'layer',
					type: 'dropdown',
					label: 'Layer',
					choices: this.choices.getLayerChoices(this.choices.getMaxConfiguredLayerCount(), false),
					default: '1',
				},
				{
					id: 'property',
					type: 'dropdown',
					label: 'Property',
					choices: [
						{ id: 'edgeEnable', label: 'Border - Edge Enabled' },
						{ id: 'edgeRound', label: 'Border - Edge Rounded' },
						{ id: 'edgeSmooth', label: 'Border - Edge Smoothed' },
						{ id: 'shadowEnable', label: 'Border - Shadow Enabled' },
						{ id: 'shadowRound', label: 'Border - Shadow Rounded' },
						{ id: 'shadowSmooth', label: 'Border - Shadow Smoothed' },
						{ id: 'filterBlackWhite', label: 'Effects - Filter Black & White' },
						{ id: 'filterNegative', label: 'Effects - Filter Negative' },
						{ id: 'filterSepia', label: 'Effects - Filter Sepia' },
						{ id: 'filterSolar', label: 'Effects - Filter Solarize' },
						{ id: 'transformFlipH', label: 'Effects - Transform Flip Horizontal' },
						{ id: 'transformFlipV', label: 'Effects - Transform Flip Vertical' },
						{ id: 'strobeEnable', label: this.choices.isFirmwareAtLeast('6.0.4') ? 'Effects - Strobe Active' : 'Effects - Strobe Active (requires at least firmware 6.0.4)' },
						{ id: 'keyingEnable', label: this.choices.isFirmwareAtLeast('5.0.128') ? 'Keying Enabled' : 'Keying Enabled (requires at least firmware 5.0.128)' },
						{ id: 'cutFillEnable', label: 'Cut&Fill - Enabled' },
						{ id: 'maskActive', label: 'Mask Active' },
						{ id: 'aspect1_1', label: 'Aspect Override - 1:1' },
						{ id: 'aspectCentered', label: 'Aspect Override - Centered' },
						{ id: 'aspectFullscreen', label: 'Aspect Override - Fullscreen' },
						{ id: 'aspectCropped', label: 'Aspect Override - Cropped' },
						{ id: 'allowCrossEffect', label: 'Transitions - Allow Cross Effect (not verified live)' },
						{ id: 'allowCrossDepth', label: 'Transitions - Allow Cross Depth (not verified live)' },
					],
					default: 'edgeEnable',
				},
			],
			callback: (feedback) => {
				const screeninfo = this.choices.getScreenInfo(feedback.options.screen)

				// "Both" checks Program AND Preview - true only if the property currently matches on both.
				const evaluateForPreset = (rawPreset: string): boolean => {
					const preset = this.choices.getPreset(feedback.options.screen, rawPreset)
					const path = [
						'DEVICE',
						...(screeninfo.isAux ? this.constants.auxPath : this.constants.screenPath),
						// platformId, not the raw "S1"-style option value directly - Midra's real item key is a
						// plain number (see getScreenInfo()'s own doc comment); reading "S1" there always missed.
						'items', screeninfo.platformId,
						'presetList', 'items', preset,
						...this.choices.getLayerPath(feedback.options.layer),
					]
					switch (feedback.options.property) {
						case 'edgeEnable': return (this.state.get([...path, 'border', 'edge', 'pp', 'style']) ?? []).includes('EDGE')
						case 'edgeRound': return (this.state.get([...path, 'border', 'edge', 'pp', 'style']) ?? []).includes('ROUNDED')
						case 'edgeSmooth': return (this.state.get([...path, 'border', 'edge', 'pp', 'style']) ?? []).includes('SMOOTH')
						case 'shadowEnable': return (this.state.get([...path, 'border', 'shadow', 'pp', 'style']) ?? []).includes('EDGE')
						case 'shadowRound': return (this.state.get([...path, 'border', 'shadow', 'pp', 'style']) ?? []).includes('ROUNDED')
						case 'shadowSmooth': return (this.state.get([...path, 'border', 'shadow', 'pp', 'style']) ?? []).includes('SMOOTH')
						case 'filterBlackWhite': return (this.state.get([...path, 'effects', 'pp', 'flags']) ?? []).includes('BLACK_N_WHITE')
						case 'filterNegative': return (this.state.get([...path, 'effects', 'pp', 'flags']) ?? []).includes('NEGATIVE')
						case 'filterSepia': return (this.state.get([...path, 'effects', 'pp', 'flags']) ?? []).includes('SEPIA')
						case 'filterSolar': return (this.state.get([...path, 'effects', 'pp', 'flags']) ?? []).includes('SOLAR')
						case 'transformFlipH': return (this.state.get([...path, 'effects', 'pp', 'flags']) ?? []).includes('FLIP_H')
						case 'transformFlipV': return (this.state.get([...path, 'effects', 'pp', 'flags']) ?? []).includes('FLIP_V')
						case 'strobeEnable': return (this.state.get([...path, 'effects', 'pp', 'flags']) ?? []).includes('STROBE')
						case 'keyingEnable': return !!this.state.get([...path, 'keying', 'pp', 'enable'])
						case 'cutFillEnable': {
							// canUseMask is a historically-misnamed flag that actually tracks whether Cut&Fill (once
							// internally called "Mask") is available on this Layer at all - live-confirmed
							// (2026-09-08). A Layer with canUseMask false cannot do Cut&Fill regardless of any
							// stored Enable state.
							const canUseCutFill = this.state.get(['DEVICE', ...(screeninfo.isAux ? this.constants.auxPath : this.constants.screenPath), 'items', screeninfo.platformId, 'layerList', 'items', feedback.options.layer, 'status', 'pp', 'canUseMask'])
							return !!canUseCutFill && this.state.get([...path, 'cutNFill', 'pp', 'type']) === 'CUT_N_FILL'
						}
						case 'maskActive': {
							const top = this.state.get([...path, 'cropping', 'mask', 'pp', 'top']) ?? 0
							const bottom = this.state.get([...path, 'cropping', 'mask', 'pp', 'bottom']) ?? 0
							const left = this.state.get([...path, 'cropping', 'mask', 'pp', 'left']) ?? 0
							const right = this.state.get([...path, 'cropping', 'mask', 'pp', 'right']) ?? 0
							return top !== 0 || bottom !== 0 || left !== 0 || right !== 0
						}
						case 'aspect1_1': return this.state.get([...path, 'cropping', 'classic', 'pp', 'aspectOverride']) === '1_1'
						case 'aspectCentered': return this.state.get([...path, 'cropping', 'classic', 'pp', 'aspectOverride']) === 'CENTERED'
						case 'aspectFullscreen': return this.state.get([...path, 'cropping', 'classic', 'pp', 'aspectOverride']) === 'FULLSCREEN'
						case 'aspectCropped': return this.state.get([...path, 'cropping', 'classic', 'pp', 'aspectOverride']) === 'CROPPED'
						case 'allowCrossEffect': return (this.state.get([...path, 'transition', 'pp', 'flags']) ?? []).includes('FORCE_CROSS')
						case 'allowCrossDepth': return !(this.state.get([...path, 'transition', 'pp', 'flags']) ?? []).some((f: string) => f.startsWith('DEPTH_CUT_'))
						default: return false
					}
				}

				if (feedback.options.preset === 'both_and') return evaluateForPreset('pgm') && evaluateForPreset('prw')
				if (feedback.options.preset === 'both_or') return evaluateForPreset('pgm') || evaluateForPreset('prw')
				return evaluateForPreset(feedback.options.preset)
			},
		}

		return deviceLayerPropertyStatus
	}

	/**
	 * MARK: deviceLayerSourceStatus / deviceLayerCutFillSourceStatus
	 * Two dedicated feedbacks for checking a specific Layer's own Source value - "Layer Properties - Property
	 * Status" only covers on/off-style checks, not a value comparison, and a "Cut&Fill - Source Assigned"
	 * on/off check (tried first) wasn't considered useful enough to keep, per explicit user decision
	 * (2026-09-08) - checking the actual expected Source value is what's actually needed.
	 * "Layer Properties - Cut&Fill Source" deliberately does NOT gate on Cut&Fill's Enable state - the raw
	 * `cut.pp.inputNum` value persists in the device's own config even while Cut&Fill is off, and shows
	 * exactly what it would use if turned on, so this reports that stored value regardless, per explicit
	 * user decision ("soll auch einen Wert haben, wenn CF aus ist und Wert in der config steht").
	 * Both share the same Screen/Preset/Layer resolution as "Layer Properties - Cut&Fill" (Layer field
	 * supports 'All Layers' and a concatenated Expression Mode string like 'L1L2', existence-guarded per
	 * Screen) - true only if EVERY resolved Layer currently shows the expected Source, consistent with this
	 * module's other multi-target feedbacks (e.g. "LIVE - Screen Freeze").
	 */
	get deviceLayerSourceStatus() {
		type DeviceLayerSourceStatus = { screen: string, preset: string, layersel: string, source: string }

		const resolveLayers = (opt: { screen: string, layersel: string }): { screenAuxKey: string, layerKey: string }[] => {
			const targetScreens = opt.screen === 'first'
				? this.choices.getSelectedScreens().slice(0, 1)
				: opt.screen === 'sel'
					? this.choices.getSelectedScreens()
					: this.choices.getChosenScreenAuxes(opt.screen)
			if (opt.layersel === 'sel') return this.choices.getSelectedLayers().filter((layer) => targetScreens.includes(layer.screenAuxKey))
			if (opt.layersel === 'first') return this.choices.getSelectedLayers().filter((layer) => targetScreens.includes(layer.screenAuxKey)).slice(0, 1)
			if (opt.layersel === 'all') return targetScreens.flatMap((screenAuxKey) => this.choices.getLayersAsArray(screenAuxKey, false).map((l) => ({ screenAuxKey, layerKey: l.id })))
			const layerKeys = this.choices.getChosenLayers(opt.layersel)
			return targetScreens.flatMap((screenAuxKey) => {
				const realIds = new Set(this.choices.getLayersAsArray(screenAuxKey, false).map((l) => l.id))
				return layerKeys.filter((k) => realIds.has(k)).map((layerKey) => ({ screenAuxKey, layerKey }))
			})
		}

		const layerOptions = [
			{
				id: 'screen',
				allowInvalidValues: true,
				type: 'dropdown' as const,
				label: 'Screen / Aux',
				choices: [{ id: 'first', label: 'First/Only Selected Screen' }, { id: 'sel', label: 'All Selected Screens' }, ...this.choices.getScreenAuxChoices()],
				default: 'first',
			},
			{
				id: 'preset',
				type: 'dropdown' as const,
				label: 'Preset (Program/Preview)',
				tooltip: '"Both (AND)" is true only if the Source currently matches on both Program and Preview at once. "Both (OR)" is true if it matches on either.',
				choices: [{ id: 'sel', label: 'Selected Preset' }, ...this.choices.choicesPreset, { id: 'both_and', label: 'Both (Preview AND Program)' }, { id: 'both_or', label: 'Both (Preview OR Program)' }],
				allowInvalidValues: true,
				default: 'prw',
			},
			{
				id: 'layersel',
				allowInvalidValues: true,
				type: 'dropdown' as const,
				label: 'Layer',
				tooltip: 'To check multiple specific Layers other than "All Layers" or "All Selected Layers", switch to Expression Mode and use a format like \'L1L2\' (in quotes, so it is recognized as text).',
				choices: [{ id: 'first', label: 'First/Only Selected Layer' }, { id: 'all', label: 'All Layers' }, { id: 'sel', label: 'All Selected Layers' }, ...Array.from({ length: this.choices.getMaxConfiguredLayerCount() }, (_i, e: number) => ({ id: (e + 1).toString(), label: `Layer ${e + 1}` }))],
				default: 'first',
			},
		]

		const deviceLayerSourceStatus: AWJfeedback<DeviceLayerSourceStatus> = {
			type: 'boolean',
			name: 'Layer Properties - Layer Source',
			sortName: '03 Layer Properties - 01a Layer Source',
			description: 'Shows whether a Layer\'s own Source (not Cut&Fill\'s - see "Layer Properties - Cut&Fill Source" for that) currently matches the selected value.',
			defaultStyle: {
				color: this.config.color_dark,
				bgcolor: this.config.color_highlight,
			},
			options: [
				...layerOptions,
				{
					id: 'source',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Source',
					tooltip: 'This module\'s own short id convention (IN{n}/IMG{n}) - the raw AWJ id (e.g. LIVE_3/STILL_3) is also accepted.',
					choices: this.choices.getSourceChoices().map((c) => ({ id: this.choices.backgroundContentToShortSource(c.id), label: c.label })),
					default: 'NONE',
				},
			],
			callback: (feedback) => {
				const layers = resolveLayers(feedback.options).filter((layer) => layer.layerKey.match(/^\d+$/))
				if (layers.length === 0) return false
				const expected = this.choices.shortSourceToBackgroundContent(feedback.options.source)
				const matchesAllLayersForPreset = (preset: string): boolean => layers.every((layer) => {
					const screenInfo = this.choices.getScreenInfo(layer.screenAuxKey)
					const path = [
						'DEVICE',
						...(screenInfo.isAux ? this.constants.auxPath : this.constants.screenPath),
						'items', screenInfo.platformId,
						'presetList', 'items', this.choices.getPreset(layer.screenAuxKey, preset),
						...this.choices.getLayerPath(layer.layerKey),
					]
					return this.state.get([...path, 'source', 'pp', 'inputNum']) === expected
				})
				if (feedback.options.preset === 'both_and') return matchesAllLayersForPreset('pgm') && matchesAllLayersForPreset('prw')
				if (feedback.options.preset === 'both_or') return matchesAllLayersForPreset('pgm') || matchesAllLayersForPreset('prw')
				return matchesAllLayersForPreset(feedback.options.preset === 'sel' ? this.choices.getPresetSelection('sel') : feedback.options.preset)
			},
		}

		return deviceLayerSourceStatus
	}

	get deviceLayerCutFillSourceStatus() {
		type DeviceLayerCutFillSourceStatus = { screen: string, preset: string, layersel: string, source: string }

		const resolveLayers = (opt: { screen: string, layersel: string }): { screenAuxKey: string, layerKey: string }[] => {
			const targetScreens = opt.screen === 'first'
				? this.choices.getSelectedScreens().slice(0, 1)
				: opt.screen === 'sel'
					? this.choices.getSelectedScreens()
					: this.choices.getChosenScreenAuxes(opt.screen)
			if (opt.layersel === 'sel') return this.choices.getSelectedLayers().filter((layer) => targetScreens.includes(layer.screenAuxKey))
			if (opt.layersel === 'first') return this.choices.getSelectedLayers().filter((layer) => targetScreens.includes(layer.screenAuxKey)).slice(0, 1)
			if (opt.layersel === 'all') return targetScreens.flatMap((screenAuxKey) => this.choices.getLayersAsArray(screenAuxKey, false).map((l) => ({ screenAuxKey, layerKey: l.id })))
			const layerKeys = this.choices.getChosenLayers(opt.layersel)
			return targetScreens.flatMap((screenAuxKey) => {
				const realIds = new Set(this.choices.getLayersAsArray(screenAuxKey, false).map((l) => l.id))
				return layerKeys.filter((k) => realIds.has(k)).map((layerKey) => ({ screenAuxKey, layerKey }))
			})
		}

		const layerOptions = [
			{
				id: 'screen',
				allowInvalidValues: true,
				type: 'dropdown' as const,
				label: 'Screen / Aux',
				choices: [{ id: 'first', label: 'First/Only Selected Screen' }, { id: 'sel', label: 'All Selected Screens' }, ...this.choices.getScreenAuxChoices()],
				default: 'first',
			},
			{
				id: 'preset',
				type: 'dropdown' as const,
				label: 'Preset (Program/Preview)',
				tooltip: '"Both (AND)" is true only if the Source currently matches on both Program and Preview at once. "Both (OR)" is true if it matches on either.',
				choices: [{ id: 'sel', label: 'Selected Preset' }, ...this.choices.choicesPreset, { id: 'both_and', label: 'Both (Preview AND Program)' }, { id: 'both_or', label: 'Both (Preview OR Program)' }],
				allowInvalidValues: true,
				default: 'prw',
			},
			{
				id: 'layersel',
				allowInvalidValues: true,
				type: 'dropdown' as const,
				label: 'Layer',
				tooltip: 'To check multiple specific Layers other than "All Layers" or "All Selected Layers", switch to Expression Mode and use a format like \'L1L2\' (in quotes, so it is recognized as text).',
				choices: [{ id: 'first', label: 'First/Only Selected Layer' }, { id: 'all', label: 'All Layers' }, { id: 'sel', label: 'All Selected Layers' }, ...Array.from({ length: this.choices.getMaxConfiguredLayerCount() }, (_i, e: number) => ({ id: (e + 1).toString(), label: `Layer ${e + 1}` }))],
				default: 'first',
			},
		]

		const deviceLayerCutFillSourceStatus: AWJfeedback<DeviceLayerCutFillSourceStatus> = {
			type: 'boolean',
			name: 'Layer Properties - Cut&Fill Source (Aquilon)',
			sortName: '03 Layer Properties - 04b Cut&Fill Source',
			description: 'Shows whether a Layer\'s Cut&Fill key Source currently matches the selected value - reports the stored value regardless of whether Cut&Fill is currently enabled (see "Layer Properties - Property Status" > "Cut&Fill - Enabled" for that).',
			defaultStyle: {
				color: this.config.color_dark,
				bgcolor: this.config.color_highlight,
			},
			options: [
				...layerOptions,
				{
					id: 'source',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Source',
					tooltip: 'This module\'s own short id convention (IN{n}/IMG{n}) - the raw AWJ id (e.g. LIVE_3/STILL_3) is also accepted.',
					choices: this.choices.getSourceChoices().map((c) => ({ id: this.choices.backgroundContentToShortSource(c.id), label: c.label })),
					default: 'NONE',
				},
			],
			callback: (feedback) => {
				const layers = resolveLayers(feedback.options).filter((layer) => layer.layerKey.match(/^\d+$/))
				if (layers.length === 0) return false
				const expected = this.choices.shortSourceToBackgroundContent(feedback.options.source)
				const matchesAllLayersForPreset = (preset: string): boolean => layers.every((layer) => {
					const screenInfo = this.choices.getScreenInfo(layer.screenAuxKey)
					// canUseMask is a historically-misnamed flag - live-confirmed (2026-09-08) it actually
					// tracks whether Cut&Fill (once internally called "Mask", predating the current separate
					// Mask/cropping feature) is available on this Layer at all, NOT the current Mask feature
					// (which works regardless). A Layer with canUseMask false cannot do Cut&Fill, so any stored
					// Source there is meaningless - report false rather than the stored value.
					if (!this.state.get(['DEVICE', ...(screenInfo.isAux ? this.constants.auxPath : this.constants.screenPath), 'items', screenInfo.platformId, 'layerList', 'items', layer.layerKey, 'status', 'pp', 'canUseMask'])) return false
					const path = [
						'DEVICE',
						...(screenInfo.isAux ? this.constants.auxPath : this.constants.screenPath),
						'items', screenInfo.platformId,
						'presetList', 'items', this.choices.getPreset(layer.screenAuxKey, preset),
						...this.choices.getLayerPath(layer.layerKey),
						'cutNFill',
					]
					return this.state.get([...path, 'cut', 'pp', 'inputNum']) === expected
				})
				if (feedback.options.preset === 'both_and') return matchesAllLayersForPreset('pgm') && matchesAllLayersForPreset('prw')
				if (feedback.options.preset === 'both_or') return matchesAllLayersForPreset('pgm') || matchesAllLayersForPreset('prw')
				return matchesAllLayersForPreset(feedback.options.preset === 'sel' ? this.choices.getPresetSelection('sel') : feedback.options.preset)
			},
		}

		return deviceLayerCutFillSourceStatus
	}

	// MARK: Master Memory
	get deviceMasterMemory() {
		
		const deviceMasterMemory: CompanionBooleanFeedbackDefinition = {
			type: 'boolean',
			name: 'LIVE - Master Memory',
			sortName: '01 LIVE - 02 Master Memory',
			description: 'Indicates the last used master memory',
			defaultStyle: {
				color: this.config.color_dark,
				bgcolor: this.config.color_highlight,
			},
			options: [
				{
					id: 'memory',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screen Memory',
					choices: this.choices.getMasterMemoryChoices(),
					default: this.choices.getMasterMemoryChoices()[0]?.id,
				},
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset (Program/Preview)',
					choices: [{ id: 'all', label: 'Any (Program/Preview)' }, ...this.choices.choicesPreset],
				allowInvalidValues: true,
					default: 'all',
				},
			],
			callback: (feedback) => {
				const memory = stripMemoryPrefix(feedback.options.memory, 'MM')
				if (
					(feedback.options.preset === 'all' || feedback.options.preset === 'pgm') &&
					this.state.get(['DEVICE', ...this.constants.lastUsedMasterPresetPath, 'presetModeList', 'items', 'PROGRAM', 'pp', 'memoryId']) == memory
				) return true
				if (
					(feedback.options.preset === 'all' || feedback.options.preset === 'pvw' || feedback.options.preset === 'prw') &&
					this.state.get(['DEVICE', ...this.constants.lastUsedMasterPresetPath, 'presetModeList', 'items', 'PREVIEW', 'pp', 'memoryId']) == memory
				) return true
				return false
			},
		}

		return deviceMasterMemory
	}

	// MARK: Screen Memory
	get deviceScreenMemory() {
		
		const deviceScreenMemory = {
			type: 'boolean',
			name: 'LIVE - Screen Memory',
			sortName: '01 LIVE - 03 Screen Memory',
			description: 'Shows whether a Screen Memory is loaded on a screen',
			defaultStyle: {
				color: this.config.color_dark,
				bgcolor: this.config.color_highlight,
			},
			options: [
				{
					id: 'screens',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screens / Auxscreens',
					choices: [{ id: 'all', label: 'Any Screen' }],
					multiple: true,
					default: ['all'],
				} as any, // TODO: fix type of dropdown with multiple: true property
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset (Program/Preview)',
					choices: [{ id: 'all', label: 'Any (Program/Preview)' }, ...this.choices.choicesPreset],
				allowInvalidValues: true,
					default: 'all',
				},
				{
					id: 'memory',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screen Memory',
					choices: this.choices.getScreenMemoryChoices(),
					default: this.choices.getScreenMemoryChoices()[0]?.id,
				},
				{
					id: 'unmodified',
					type: 'dropdown',
					label: 'is Modified',
					choices: [
						{ id: 0, label: 'only if unmodified' },
						{ id: 1, label: 'only if modified' },
						{ id: 2, label: "don't care unmodified or modified" },
					],
					default: 2,
				},
			],
			callback: (feedback: CompanionFeedbackBooleanEvent & { options: { screens: string[], preset: string, memory: string, unmodified: number } }) => {
				const screens = this.choices.getChosenScreensSupportedByScreenMemories(feedback.options.screens)
				const presets = feedback.options.preset === 'all' ? ['pgm', 'pvw'] : [feedback.options.preset]
				const memory = stripMemoryPrefix(feedback.options.memory, 'SM')

				for (const screen of screens) {
					const screeninfo = this.choices.getScreenInfo(screen)
					for (const preset of presets) {
						if (
							this.state.get([
								'DEVICE',
								...(screeninfo.isAux ? this.constants.auxPath : this.constants.screenPath),
								'items',
								screeninfo.platformId,
								'presetList',
								'items',
								this.choices.getPreset(screeninfo.id, preset),
								...this.constants.activeScreenMemoryIdPath,
							]) == memory
						) {
							if (feedback.options.unmodified === 2) return true
							const modified = this.state.get([
								'DEVICE',
								...(screeninfo.isAux ? this.constants.auxPath : this.constants.screenPath),
								'items',
								screeninfo.platformId,
								'presetList',
								'items',
								this.choices.getPreset(screen, preset),
								...this.constants.activeScreenMemoryIsModifiedPath,
							])
							if (
								(
									(!this.constants.activeScreenMemoryValueValid && modified) || 
									(this.constants.activeScreenMemoryValueValid && !modified)
								) == feedback.options.unmodified
							) {
								return true
							}
						}
					}
				}
				return false
			},
		}

		return deviceScreenMemory
	}

	/**
	 * MARK: deviceScreenMemorySlotStatus
	 * Shows whether a Screen Memory slot currently has content, independent of whether it's the slot loaded on
	 * any specific screen - same status.pp.isValid field getAllScreenMemorySlotChoices() already uses to label
	 * a slot "(overwrite)" vs "(empty)" for "Save Screen Memory to Slot".
	 */
	get deviceScreenMemorySlotStatus() {
		type DeviceScreenMemorySlotStatus = { memory: string }

		const deviceScreenMemorySlotStatus: AWJfeedback<DeviceScreenMemorySlotStatus> = {
			type: 'boolean',
			name: 'LIVE - Screen Memory Slot Occupied',
			sortName: '01 LIVE - 13 Screen Memory Slot Occupied',
			description: 'Shows whether a Screen Memory slot currently has content saved (as opposed to still being empty) - helps avoid accidentally overwriting an existing memory, or find a free slot, when using "Save Screen Memory to Slot".',
			defaultStyle: {
				color: this.config.color_dark,
				bgcolor: this.config.color_highlight,
			},
			options: [
				{
					id: 'memory',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screen Memory Slot',
					choices: this.choices.getAllScreenMemorySlotChoices(),
					default: this.choices.getAllScreenMemorySlotChoices()[0]?.id,
				},
			],
			callback: (feedback) => {
				return !!this.state.get(['DEVICE', ...this.constants.screenMemoryPath, 'items', stripMemoryPrefix(feedback.options.memory, 'SM'), 'status', 'pp', 'isValid'])
			},
		}

		return deviceScreenMemorySlotStatus
	}

	// MARK: Aux Memory - Midra
	get deviceAuxMemory() {
		
		const deviceAuxMemory: AWJfeedback<{ screens: string[], preset: string, memory: string, unmodified: number }> = {
			type: 'boolean',
			name: 'LIVE - Aux Memory (Midra/Alta)',
			sortName: '01 LIVE - 04 Aux Memory',
			description: 'Shows whether an Aux Memory is loaded on an auxscreen',
			defaultStyle: {
				color: this.config.color_dark,
				bgcolor: this.config.color_highlight,
			},
			options: [
				{
					id: 'screens',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Aux Screens',
					choices: [{ id: 'all', label: 'Any Screen' }, ...this.choices.getAuxChoices()],
					multiple: true,
					tags: true,
					regex: '/^S([1-9]|[1-3][0-9]|4[0-8])$/',
					default: ['all'],
				} as any, // TODO: fix type of dropdown with multiple: true property
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset (Program/Preview)',
					choices: [{ id: 'all', label: 'Any (Program/Preview)' }, ...this.choices.choicesPreset],
				allowInvalidValues: true,
					default: 'all',
				},
				{
					id: 'memory',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Aux Memory',
					choices: this.choices.getAuxMemoryChoices(),
					default: this.choices.getAuxMemoryChoices()[0]?.id,
				},
				{
					id: 'unmodified',
					type: 'dropdown',
					label: 'is Modified',
					choices: [
						{ id: 0, label: 'only if unmodified' },
						{ id: 1, label: 'only if modified' },
						{ id: 2, label: "don't care unmodified or modified" },
					],
					default: 2,
				},
			],
			callback: (feedback) => {
				const screens = this.choices.getChosenAuxes(feedback.options.screens)
				const presets = feedback.options.preset === 'all' ? ['pgm', 'pvw'] : [feedback.options.preset]
				const memory = stripMemoryPrefix(feedback.options.memory, 'AM')

				for (const screen of screens) {
					const screeninfo = this.choices.getScreenInfo(screen)
					for (const preset of presets) {
						if (
							this.state.get([
								'DEVICE',
								'device',
								'auxiliaryScreenList', 'items', screeninfo.numstr,
								'presetList', 'items', this.choices.getPreset(screen, preset),
								'status','pp','memoryId',
							]) == memory
						) {
							if (feedback.options.unmodified === 2) return true
							const modified = this.state.get([
								'DEVICE',
								'device',
								'auxiliaryScreenList', 'items', screeninfo.numstr,
								'presetList', 'items', this.choices.getPreset(screen, preset),
								'status','pp','isModified',
							])
							if (modified == feedback.options.unmodified) {
								return true
							}
						}
					}
				}
				return false
			},
		}

		return deviceAuxMemory
	}

	// MARK: deviceSourceTally
	get deviceSourceTally() {
		
		const deviceSourceTally: AWJfeedback<{ screens: string, preset: string, source: string }> = {
			type: 'boolean',
			name: 'LIVE - Source Tally',
			sortName: '01 LIVE - 05 Source Tally',
			description: 'Shows whether a source is visible on program or preview in a screen',
			defaultStyle: {
				color: this.config.color_dark,
				bgcolor: this.config.color_highlight,
			},
			options: [
				{
					id: 'screens',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screens / Auxscreens',
					tooltip: 'To target multiple specific Screens other than "Any Screen" or "Selected Screens", switch to Expression Mode and use a format like \'S1S2A1\' (in quotes, so it is recognized as text).',
					choices: [{ id: 'first', label: 'First/Only Selected Screen' }, { id: 'all', label: 'Any Screen' }, { id: 'sel', label: 'Selected Screens' }, ...this.choices.getScreenAuxChoices()],
					default: 'all',
				},
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset (Program/Preview)',
					tooltip: '"Both (AND)" is true only if the source is currently tallied on both Program and Preview at once. "Both (OR)" is true if it\'s tallied on either.',
					choices: [...this.choices.choicesPreset, { id: 'both_and', label: 'Both (Preview AND Program)' }, { id: 'both_or', label: 'Both (Preview OR Program)' }],
					allowInvalidValues: true,
					default: 'pgm',
				},
				{
					id: 'source',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Source',
					tooltip: 'This module\'s own short id convention (IN{n}/IMG{n}) - the raw AWJ id (e.g. LIVE_3/STILL_3) is also accepted.',
					choices: [...this.choices.getSourceChoices().map((c) => ({ id: this.choices.backgroundContentToShortSource(c.id), label: c.label })), ...this.choices.choicesBackgroundSources],
					default: 'NONE',
				},
			],
			unsubscribe: (feedback: CompanionFeedbackBooleanEvent & { options: { screens: string, preset: string, source: string } }) => {
				const targetScreens = feedback.options.screens === 'first' ? this.choices.getSelectedScreens().slice(0, 1) : this.choices.getChosenScreenAuxes(feedback.options.screens)
				const sortedScreens = [...targetScreens].sort()
				const varName = `tally_${sortedScreens.join('-')}_${feedback.options.preset}_${feedback.options.source}`
				this.instance.removeVariable(feedback.id, varName)
			},
			callback: (feedback) => {
				// Screens field follows the module's usual "S1S2A1" concatenated Expression Mode convention
				// (see resolveTargets-style helpers elsewhere) rather than Companion's own native multi-select,
				// per explicit user decision - 'first' isn't understood by getChosenScreenAuxes() itself, so it's
				// resolved the same way every other "Screens" field in this module already does.
				const targetScreens = feedback.options.screens === 'first' ? this.choices.getSelectedScreens().slice(0, 1) : this.choices.getChosenScreenAuxes(feedback.options.screens)
				const sortedScreens = [...targetScreens].sort()
				const varName = `tally_${sortedScreens.join('-')}_${feedback.options.preset}_${feedback.options.source}`
				this.instance.addVariable({
					id: feedback.id,
					variableId: varName,
					name: `Tally for ${feedback.options.source} at screens ${sortedScreens.join(', ')}, preset ${feedback.options.preset}`,
				})
				// Converts this module's own short id (IN{n}/IMG{n}) back to the raw AWJ id (LIVE_n/STILL_n) the
				// device actually stores - anything else (NONE/COLOR/SCREEN_n/NATIVE_n, or an already-raw id
				// typed directly via Expression Mode) passes through unchanged.
				const expectedSource = this.choices.shortSourceToBackgroundContent(feedback.options.source)
				// True if the source is showing somewhere on this one Screen/Aux (OR across its Layers - any one
				// Layer showing it is enough for the Screen to count).
				const screenHasSource = (screen: string, rawPreset: string): boolean => {
					const screeninfo = this.choices.getScreenInfo(screen)
					const preset = this.choices.getPreset(screen, rawPreset)
					for (const layer of this.choices.getLayerChoices(screen)) {
						const screenpath = [
							'DEVICE',
							...(screeninfo.isAux ? this.constants.auxPath : this.constants.screenPath),
							'items',
							screen
						]
						const presetpath = [...screenpath, 'presetList', 'items', preset]
						const layerpath = [...presetpath, ...this.choices.getLayerPath(layer.id)]

						if (
							(expectedSource === 'NONE' || expectedSource?.toString().startsWith('BACKGROUND'))
							&& this.state.get([...presetpath, 'source', 'pp', 'inputNum']) === expectedSource
						) {
							return true
						}
						if (this.state.get([...layerpath, 'source', 'pp', 'inputNum']) === expectedSource) {
							const invisible = (
								this.state.get([...layerpath, 'position', 'pp', 'sizeH']) === 0 ||
								this.state.get([...layerpath, 'position', 'pp', 'sizeV']) === 0 ||
								this.state.get([...layerpath, 'opacity', 'pp', 'opacity']) === 0 ||
								this.state.get([...layerpath, 'cropping', 'classic', 'pp', 'top']) +
									this.state.get([...layerpath,'cropping', 'classic', 'pp', 'bottom']) >
									65528 ||
								this.state.get([...layerpath, 'cropping', 'classic', 'pp', 'left']) +
									this.state.get([...layerpath, 'cropping', 'classic', 'pp', 'right']) >
									65528 ||
								this.state.get([...layerpath, 'cropping', 'mask', 'pp', 'top']) +
									this.state.get([...layerpath, 'cropping', 'mask', 'pp', 'bottom']) >
									65528 ||
								this.state.get([...layerpath, 'cropping', 'mask', 'pp', 'left']) +
									this.state.get([...layerpath, 'cropping', 'mask', 'pp', 'right']) >
									65528 ||
								this.state.get([...layerpath, 'position', 'pp', 'posH']) + this.state.get([...layerpath, 'position', 'pp', 'sizeH']) / 2 <= 0 ||
								this.state.get([...layerpath, 'position', 'pp', 'posV']) + this.state.get([...layerpath, 'position', 'pp', 'sizeV']) / 2 <= 0 ||
								this.state.get([...layerpath, 'position', 'pp', 'posH']) - this.state.get([...layerpath, 'position', 'pp', 'sizeH']) / 2 >=
									this.state.get([...screenpath, 'status', 'size', 'pp', 'sizeH']) ||
								this.state.get([...layerpath, 'position', 'pp', 'posV']) - this.state.get([...layerpath, 'position', 'pp', 'sizeV']) / 2 >=
									this.state.get([...screenpath, 'status', 'size', 'pp', 'sizeV'])
							)
							if (!invisible) {
								return true
							}
						}
					}
					return false
				}

				// Parameterized on the resolved preset ('pgm'/'prw') rather than reading feedback.options.preset
				// directly, so "Both" can run this same check once per preset and AND/OR the two results -
				// 'both_and'/'both_or' themselves are never valid input to getPreset(). Screens combine with AND
				// (true only if every selected Screen/Aux currently shows the source), per explicit user
				// decision (2026-09-08) - unlike Layers within one Screen, which stay OR.
				const checkTallyForPreset = (rawPreset: string): boolean => {
					// every() is vacuously true on an empty array - explicitly guard so "no Screen resolved"
					// (e.g. "Selected Screens" with nothing selected) reads as false, not a false-positive true.
					if (targetScreens.length === 0) return false
					return targetScreens.every((screen) => screenHasSource(screen, rawPreset))
				}

				const checkTally = (): boolean => {
					if (feedback.options.preset === 'both_and') return checkTallyForPreset('pgm') && checkTallyForPreset('prw')
					if (feedback.options.preset === 'both_or') return checkTallyForPreset('pgm') || checkTallyForPreset('prw')
					return checkTallyForPreset(feedback.options.preset)
				}

				const tally = checkTally()
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
			},
		}

		return deviceSourceTally
	}

	// MARK: deviceTake
	get deviceTake() {
		
		const deviceTake: AWJfeedback<{screens: string}> = {
			type: 'boolean',
			name: 'LIVE - Transition active',
			sortName: '01 LIVE - 06 Transition active',
			description: 'Shows whether a screen is currently in a take/fade transition',
			defaultStyle: {
				color: this.config.color_dark,
				bgcolor: this.config.color_highlight,
			},
			options: [
				{
					id: 'screens',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screens / Auxscreens',
					choices: [{ id: 'all', label: 'Any Screen' }, ...this.choices.getScreenAuxChoices()],
					multiple: true,
					tags: true,
					regex: '/^(S|A)([1-9]|[1-3][0-9]|4[0-8])$/',
					default: 'all',
				} as any, // TODO: fix type of dropdown with multiple: true property
			],
			callback: () => {
				return false
			},
		}

		return deviceTake
	}

	// MARK: liveScreenSelection
	get liveScreenSelection() {
		
		const liveScreenSelection: AWJfeedback<{screen: string}> = {
			type: 'boolean',
			name: 'LIVE - Screen Selection',
			sortName: '01 LIVE - 07 Screen Selection',
			description: 'Shows whether a screen is currently selected',
			defaultStyle: {
				color: this.config.color_dark,
				bgcolor: this.config.color_highlight,
			},
			options: [
				{
					id: 'screen',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screen / Auxscreen',
					choices: this.choices.getScreenAuxChoices(),
					default: this.choices.getScreenAuxChoices()[0]?.id
				},
			],
			callback: (feedback) => {
				return this.choices.getSelectedScreens()?.includes(feedback.options.screen)
			},
		}

		return liveScreenSelection
	}

	// MARK: liveScreenLock
	get liveScreenLock() {
		
		const liveScreenLock: AWJfeedback<{screen: string, preset: string }> = {
			type: 'boolean',
			name: 'LIVE - Screen Lock',
			sortName: '01 LIVE - 08 Screen Lock',
			description: 'Shows whether a screen currently is locked',
			defaultStyle: {
				color: this.config.color_dark,
				bgcolor: this.config.color_highlight,
				png64:
					'iVBORw0KGgoAAAANSUhEUgAAADcAAAA3CAYAAACo29JGAAABSklEQVRoge2a2w7DIAhAZdl3N60/zp5MjBNLBdwknKe19cIZLdVlKTkGrCc4jgOpazln0/lNBh8JUViIqg44I9WiKaky0J0UwHgaxO/uAADXdYnieol6J7lYacNp9xSxHMVMwHV77KXzaQySzlTWmiB5gRB9JM+geuZKkIjIFivt2zHEscx27GWtFmvOd+fp3Xq9MWazp565JgNAiZXr2vPXqMm1cXIDb9uVL0fD26xa/gMhtyshtyshtyshtyshtyuu5YarU40ffKwZbYdcZ+7NbWi89WKBiAkA2Dt815kLuV1hP3NSzvOE6vOSKrwkc7VY79gKczlKZIWgqdydgLWg64IScrPcVUXrqrmioHQFVrwOVr0KcHRsRbzndiXkJLhdofyakJsl1paGuJYz3YmvWolQuM6cazn2banwPzMVnsThOnOu5VzzARnBeIM8tq0ZAAAAAElFTkSuQmCC',
			},
			options: [
				{
					id: 'screen',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screen',
					choices: [{ id: 'all', label: 'All Screens' }, ...this.choices.getScreenAuxChoices()],
					default: 'all',
					tooltip: '"All" resembles the state of the lock-all button in WebRCS.',
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
			],
			callback: (feedback: CompanionFeedbackBooleanEvent & { options: { screen: string, preset: string } }) => {
				return this.choices.isLocked(feedback.options.screen, feedback.options.preset)
			},
		}

		return liveScreenLock
	}

	// MARK: livePresetSelection
	get livePresetSelection() {
		
		const livePresetSelection: AWJfeedback<{preset: string }> = {
			type: 'boolean',
			name: 'LIVE - Preset Selection (Program/Preview)',
			sortName: '01 LIVE - 09 Preset Selection (Program/Preview)',
			description: 'Shows whether program or preview is currently selected',
			defaultStyle: {
				color: this.config.color_dark,
				bgcolor: this.config.color_highlight,
			},
			options: [
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset (Program/Preview)',
					choices: [
						{ id: 'PROGRAM', label: 'Program' },
						{ id: 'PREVIEW', label: 'Preview' },
					],
					default: 'PROGRAM'
				},
			],
			callback: (feedback) => {
				let preset: string,
					vartext = 'PGM'
				if (this.state.syncSelection) {
					preset = this.state.get('REMOTE/live/screens/presetModeSelection/presetMode')
				} else {
					preset = this.state.get('LOCAL/presetMode')
				}
				if (preset === 'PREVIEW') {
					vartext = this.config.useOldVariableNames ? 'PVW' : 'PRW'
				}
				this.instance.setVariableValues({ selectedPreset: vartext })
				return preset === feedback.options.preset
			},
		}

		return livePresetSelection
	}

	// MARK: remoteLayerSelection
	get remoteLayerSelection() {
		
		const remoteLayerSelection: AWJfeedback<{screen: string, layer: string, preset: string }> = {
			type: 'boolean',
			name: 'LIVE - Layer Selection',
			sortName: '01 LIVE - 10 Layer Selection',
			description: 'Shows whether a layer is currently selected',
			defaultStyle: {
				color: this.config.color_dark,
				bgcolor: this.config.color_highlight,
			},
			options: [
				{
					id: 'screen',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screen / Auxscreen',
					choices: [{ id: 'all', label: 'Any Screen' }, ...this.choices.getScreenAuxChoices()],
					default: 'all',
				},
				{
					id: 'layer',
					type: 'dropdown',
					label: 'Layer',
					choices: [{ id: 'all', label: 'Any Layer' }, ...this.choices.getLayerChoices(48, true)],
					default: 'all',
				},
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset (Program/Preview)',
					choices: [
						{ id: 'all', label: 'Any (Program/Preview)' },
						{ id: 'PROGRAM', label: 'Program' },
						{ id: 'PREVIEW', label: 'Preview' },
					],
					default: 'all',
				},
			],
			callback: (feedback) => {
				let pst = true
				if (feedback.options.preset != 'all') {
					let preset: string
					if (this.state.syncSelection) {
						preset = this.state.get('REMOTE/live/screens/presetModeSelection/presetMode')
					} else {
						preset = this.state.get('LOCAL/presetMode')
					}
					if (preset != feedback.options.preset) {
						pst = false
					}
				}
				const layer = feedback.options.layer === 'all' ? 'all' : this.choices.normalizeLayerId(feedback.options.layer)
				if (layer === 'all' && feedback.options.screen === 'all') {
					return this.choices.getSelectedLayers().length > 0 && pst
				} else if (feedback.options.screen === 'all') {
					return (
						JSON.stringify(this.choices.getSelectedLayers()).includes(
							`"layerKey":"${layer}"`
						) && pst
					)
				} else if (layer === 'all') {
					return (
						JSON.stringify(this.choices.getSelectedLayers()).includes(
							`{"screenAuxKey":"${this.choices.getScreenInfo(feedback.options.screen).id}","layerKey":"`
						) && pst
					)
				} else {
					return (
						JSON.stringify(this.choices.getSelectedLayers()).includes(
							`{"screenAuxKey":"${this.choices.getScreenInfo(feedback.options.screen).id}","layerKey":"${layer}"}`
						) && pst
					)
				}
			},
		}

		return remoteLayerSelection
	}

	// MARK: remoteWidgetSelection
	get remoteWidgetSelection() {
		
		const remoteWidgetSelection: AWJfeedback<{widget: string }> = {
			type: 'boolean',
			name: 'Multiviewer - Widget Selection',
			sortName: '02 Multiviewer - Widget Selection',
			description: 'Shows whether a multiviewer widget is currently selected',
			defaultStyle: {
				color: this.config.color_dark,
				bgcolor: this.config.color_highlight,
			},
			options: [
				{
					id: 'widget',
					type: 'dropdown',
					label: 'Widget',
					choices: this.choices.getWidgetChoices(),
					default: this.choices.getWidgetChoices()[0]?.id,
				},
			],
			callback: (feedback) => {
				const mvw = feedback.options.widget?.toString().split(':')[0] ?? '1'
				const widget = feedback.options.widget?.toString().split(':')[1] ?? '0'
				let widgetSelection: {widgetKey: string, mocOutputLogicKey: string}[] = []
				if (this.state.syncSelection) {
					widgetSelection = [...(this.state.get('REMOTE/live/multiviewers/widgetSelection/widgetIds') ?? [])]
				} else {
					widgetSelection = this.state.get('LOCAL/widgetSelection/widgetIds') ?? []
				}
				return JSON.stringify(widgetSelection).includes(`{"widgetKey":"${widget}","mocOutputLogicKey":"${mvw}"}`)
			},
		}

		return remoteWidgetSelection
	}

	// MARK: deviceInputFreeze
	get deviceInputFreeze() {
		
		const deviceInputFreeze: AWJfeedback<{input: string}> = {
			type: 'boolean',
			name: 'LIVE - Input Freeze',
			sortName: '01 LIVE - 15 Freeze - Input',
			description: 'Shows whether an input currently is frozen',
			defaultStyle: {
				color: this.config.color_bright,
				bgcolor: combineRgb(0, 0, 100),
				png64:
					'iVBORw0KGgoAAAANSUhEUgAAADcAAAA3AQMAAACSFUAFAAABS2lUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4KPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNS42LWMxMzggNzkuMTU5ODI0LCAyMDE2LzA5LzE0LTAxOjA5OjAxICAgICAgICAiPgogPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4KICA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIi8+CiA8L3JkZjpSREY+CjwveDp4bXBtZXRhPgo8P3hwYWNrZXQgZW5kPSJyIj8+IEmuOgAAAARnQU1BAACxjwv8YQUAAAABc1JHQgCuzhzpAAAABlBMVEUAAABfXKLsUQDeAAAAAXRSTlMAQObYZgAAAM9JREFUGNONkTEOwjAMRX9UpDC1nIBwEKRyJCMGmNogDsCRyMY1wg26ESTUYLc1sEGWp1h2/vcPABDG84MrWoxXOgxcUycol7tbEFb748Aim4HmKZyXSCZsUFpQwQ1OeIqorsxzQHFnXgCTmT3PtczErD1ZEXCBXJR6RzXXzSNR3wA2NrvkPCpf52gDZnDZw3Oj7Ue/xfObM9gMSL/LgfttbHPH8+bRb+U9tIla0XVx1FP9yY/6U7/qX/fR/XRf3f+Th+Yz5aX5vfPUfP/6jxdhImTMvNrBOgAAAABJRU5ErkJggg==',
			},
			options: [
				{
					id: 'input',
					type: 'dropdown',
					label: 'Input',
					// Canonical/default value is this module's own short 'IN{n}' convention, but the callback
					// also accepts a bare number or the old V2-style 'IN_n' - see deviceInputFreeze action's
					// own matching comment for why (2026-09-08).
					choices: this.choices.getLiveInputArray().map((inp) => ({ id: `IN${inp.index}`, label: `Input ${inp.index}${inp.label ? ' - ' + inp.label : ''}` })),
					default: `IN${this.choices.getLiveInputArray()[0]?.index ?? ''}`,
					allowInvalidValues: true,
				},
			],
			callback: (feedback) => {
				const match = (feedback.options.input ?? '').toString().match(/^(?:IN_?)?(\d+)$/i)
				const input = match ? `IN_${match[1]}` : ''
				// The IN{n}.freeze variable itself is maintained for every available input independently of
				// this feedback (subscriptions.inputFreeze), so nothing to do here beyond the boolean result.
				return input ? !!this.state.get('DEVICE/device/inputList/items/' + input + '/control/pp/freeze') : false
			},
		}

		return deviceInputFreeze
	}

	// MARK: deviceInputSignalStatus
	get deviceInputSignalStatus() {

		const deviceInputSignalStatus: AWJfeedback<{input: string}> = {
			type: 'boolean',
			name: 'Device - Input Signal Present',
			sortName: '07 Device - 06 Input Signal Present',
			description: 'Shows whether a live signal is currently present on an Input (based on its currently active plug).',
			defaultStyle: {
				color: this.config.color_dark,
				bgcolor: this.config.color_highlight,
			},
			options: [
				{
					id: 'input',
					type: 'dropdown',
					label: 'Input',
					choices: this.choices.getLiveInputChoices(),
					default: this.choices.getLiveInputChoices()[0]?.id,
				},
			],
			callback: (feedback) => {
				const input = feedback.options.input?.toString().replace('LIVE', 'IN') || ''
				const activePlug = this.state.get(['DEVICE', 'device', 'inputList', 'items', input, 'status', 'pp', 'plug']) ?? '1'
				return !!this.state.get(['DEVICE', 'device', 'inputList', 'items', input, 'plugList', 'items', activePlug, 'status', 'signal', 'pp', 'isValid'])
			},
		}

		return deviceInputSignalStatus
	}

	/**
	 * MARK: deviceLayerSignalStatus
	 * Mirrors the computed logic subscriptions.ts already uses for a Layer's own signal-status variable: a
	 * Layer showing a live Input delegates to that Input's own signal presence (deviceInputSignalStatus above);
	 * any other source type (Still/Color/Timer/Screen re-insertion) has no "signal" concept and always counts
	 * as present.
	 */
	get deviceLayerSignalStatus() {
		type DeviceLayerSignalStatus = { screen: string, layer: string, preset: string }

		const deviceLayerSignalStatus: AWJfeedback<DeviceLayerSignalStatus> = {
			type: 'boolean',
			name: 'Device - Layer Signal Present',
			sortName: '07 Device - 07 Layer Signal Present',
			description: 'Shows whether the source currently shown by a Layer has a live signal - always true unless the Layer shows a live Input that has lost its signal.',
			defaultStyle: {
				color: this.config.color_dark,
				bgcolor: this.config.color_highlight,
			},
			options: [
				{
					id: 'screen',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Screen / Aux',
					choices: this.choices.getScreenAuxChoices(),
					default: this.choices.getScreenAuxChoices()[0]?.id,
				},
				{
					id: 'layer',
					type: 'dropdown',
					label: 'Layer',
					choices: this.choices.getLayerChoices(this.choices.getMaxConfiguredLayerCount(), false),
					default: '1',
				},
				{
					id: 'preset',
					type: 'dropdown',
					label: 'Preset (Program/Preview)',
					choices: [{ id: 'sel', label: 'Selected' }, ...this.choices.choicesPreset],
					allowInvalidValues: true,
					default: 'sel',
				},
			],
			callback: (feedback) => {
				const screeninfo = this.choices.getScreenInfo(feedback.options.screen)
				const preset = this.choices.getPreset(feedback.options.screen, feedback.options.preset)
				const layerpath = [
					'DEVICE',
					...(screeninfo.isAux ? this.constants.auxPath : this.constants.screenPath),
					// platformId, not the raw "S1"-style option value directly - see deviceLayerPropertyStatus's
					// matching fix/comment above.
					'items', screeninfo.platformId,
					'presetList', 'items', preset,
					'layerList', 'items', feedback.options.layer,
				]
				// TODO: 'source'/'pp'/'inputNum' and the IN_{n} raw id below are confirmed correct for LivePremier/
				// LivePremier4 only - Midra's own deviceSelectSourceV3 action writes numbered layers' source to
				// .../source/pp/input (singular, not inputNum) and uses INPUT_{n} elsewhere for its raw input ids,
				// so this feedback is suspected to also need a Midra-specific override, but the exact field name/
				// value format on Midra has not been live-verified this session - not guessing at a protocol
				// value, left as-is pending live confirmation.
				const source = this.state.get([...layerpath, 'source', 'pp', 'inputNum'])
				const liveMatch = typeof source === 'string' ? source.match(/^(?:LIVE|IN)_(\d+)$/) : null
				if (!liveMatch) return true
				const inputKey = `IN_${liveMatch[1]}`
				const activePlug = this.state.get(['DEVICE', 'device', 'inputList', 'items', inputKey, 'status', 'pp', 'plug']) ?? '1'
				return !!this.state.get(['DEVICE', 'device', 'inputList', 'items', inputKey, 'plugList', 'items', activePlug, 'status', 'signal', 'pp', 'isValid'])
			},
		}

		return deviceLayerSignalStatus
	}

	/**
	 * MARK: deviceHealthStatus
	 * Mirrors subscriptions.ts's deviceHealth logic (same paths/deviceListPrefix auto-probe and recursive
	 * fan-alarm scan) as a checkable boolean instead of only a Device.Status.Temperature/Fans text variable.
	 */
	get deviceHealthStatus() {
		type DeviceHealthStatus = { aspect: string }

		const anyAlarm = (obj: any): boolean => {
			if (obj === null || typeof obj !== 'object') return false
			for (const key in obj) {
				if (key === 'alarm' && obj[key] === true) return true
				if (anyAlarm(obj[key])) return true
			}
			return false
		}

		const deviceHealthStatus: AWJfeedback<DeviceHealthStatus> = {
			type: 'boolean',
			name: 'Device - Health Alarm',
			sortName: '07 Device - 08 Health Alarm',
			description: 'Shows whether the device currently reports a Temperature or Fan alarm/warning.',
			defaultStyle: {
				color: this.config.color_bright,
				bgcolor: combineRgb(200, 0, 0),
			},
			options: [
				{
					id: 'aspect',
					type: 'dropdown',
					label: 'Check',
					choices: [
						{ id: 'temperature', label: 'Temperature Alarm' },
						{ id: 'fans', label: 'Fan Alarm' },
					],
					default: 'temperature',
				},
			],
			callback: (feedback) => {
				const deviceListPrefix = this.state.get('DEVICE/device/system/temperature/device/pp/alarm') !== undefined ? '' : 'deviceList/items/1/'
				if (feedback.options.aspect === 'temperature') {
					const alarm = this.state.get(`DEVICE/device/system/${deviceListPrefix}temperature/device/pp/alarm`)
					return alarm !== undefined && alarm !== 'NONE'
				} else {
					return anyAlarm(this.state.get(`DEVICE/device/system/${deviceListPrefix}fan`))
				}
			},
		}

		return deviceHealthStatus
	}

	/**
	 * MARK: deviceConnectionStatus
	 * Reflects this connection's own InstanceStatus, as tracked by AWJinstance.updateStatus() - more granular
	 * than Companion's built-in Connection Status feedback (which only distinguishes good/warning/error/disabled).
	 * While "Enable Hot Backup Device" is unchecked, the Hot Backup Device reads "Not Configured" rather than
	 * mirroring Main's status; while enabled, it simply mirrors Main's status, since it has no real connection
	 * of its own yet (see AWJinstance.updateHotBackupVariables()).
	 */
	get deviceConnectionStatus() {
		type DeviceConnectionStatus = { device: string; status: InstanceStatus | 'not_configured' }

		const deviceConnectionStatus: AWJfeedback<DeviceConnectionStatus> = {
			type: 'boolean',
			name: 'Device - Connection Status',
			sortName: '07 Device - 09 Connection Status',
			description: 'Shows whether the Main Device or the (currently simulated) Hot Backup Device connection is in a given status.',
			defaultStyle: {
				color: this.config.color_bright,
				bgcolor: combineRgb(0, 200, 0),
			},
			options: [
				{
					id: 'device',
					type: 'dropdown',
					label: 'Device',
					choices: [
						{ id: 'main', label: 'Main Device' },
						{ id: 'hotbackup', label: 'Hot Backup Device' },
					],
					default: 'main',
				},
				{
					id: 'status',
					type: 'dropdown',
					label: 'Status',
					choices: [
						{ id: InstanceStatus.Ok, label: 'Ok' },
						{ id: InstanceStatus.Connecting, label: 'Connecting' },
						{ id: InstanceStatus.Disconnected, label: 'Disconnected' },
						{ id: InstanceStatus.ConnectionFailure, label: 'Connection Failure' },
						{ id: InstanceStatus.BadConfig, label: 'Bad Config' },
						{ id: InstanceStatus.UnknownError, label: 'Unknown Error' },
						{ id: InstanceStatus.UnknownWarning, label: 'Unknown Warning' },
						{ id: InstanceStatus.AuthenticationFailure, label: 'Authentication Failure' },
						{ id: InstanceStatus.InsufficientPermissions, label: 'Insufficient Permissions' },
						{ id: 'not_configured', label: 'Not Configured (Hot Backup only)' },
					],
					default: InstanceStatus.Ok,
				},
			],
			callback: (feedback) => {
				const actual = feedback.options.device === 'hotbackup'
					? this.instance.getVariableValue('Device.Connected.Hotbackupdevice')
					: this.instance.currentInstanceStatus
				return actual === feedback.options.status
			},
		}

		return deviceConnectionStatus
	}

	// MARK: deviceLayerFreeze
	// Midra only
	get deviceLayerFreeze() {
		
		const deviceLayerFreeze: AWJfeedback<{screen: string}> = {
			type: 'boolean',
			name: 'Freeze - Layer (Midra/Alta)',
			sortName: '01 LIVE - 16 Freeze - Layer',
			description: 'Shows whether a layer currently is frozen',
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
					choices: [{id: 'any', label:'Any Screen'}, ...this.choices.getScreenChoices()],
					default: this.choices.getScreenChoices()[0]?.id,
					disableAutoExpression: true,
				},
				...[
					{id: 'any', label:'Any'},
					...this.choices.getScreenChoices()
				].map(
					(screen) => {
						const opt = {
							id: `layer${screen.id}`,
							type: 'dropdown' as const,
							label: 'Layer',
							choices: [
								{id:'any', label: 'Any Layer'},
								{id:'NATIVE', label: 'Background Layer'}
							],
							default: '1',
							isVisibleExpression: `$(options:screen) == '${screen.id}'`,
						}
						if (screen.id === 'any') {
							opt.choices.push(...this.choices.getLayerChoices(this.choices.getMaxConfiguredLayerCount(), false))
						} else {
							opt.label += ' ' + screen.id
							opt.choices.push(...this.choices.getLayerChoices(screen.id, false))
						}
						return opt
					}
				),
			],
			callback: (feedback) => {
				let retval = false
				let screens: Choicemeta[]
				if (feedback.options.screen === 'any') {
					screens = this.choices.getScreensArray()
				} else {
					screens = [{index: feedback.options.screen.replace(/\D/g, ''), id: feedback.options.screen, label: feedback.options.screen}]
				}
				const layeropt = feedback.options[`layer${feedback.options.screen}`] as string
				for (const screen of screens) {
					let layers: string[]
					if (layeropt === 'any') {
						layers = this.choices.getLayersAsArray(screen.id, false).map(layer => layer.id)
					} else {
						layers = [layeropt]
					}
					for (const layer of layers) {
						let path: string[]
						if (layer === 'NATIVE') {
							path = ['DEVICE', 'device', 'screenList', 'items', `${screen.index}`, 'background', 'control', 'pp', 'freeze']
						} else {
							path = ['DEVICE', 'device', 'screenList', 'items', `${screen.index}`, 'liveLayerList', 'items', layer, 'control', 'pp', 'freeze']
						}
						if (this.state.get(path)) retval = true
					}
				}
				return retval
				
			},
		}

		return deviceLayerFreeze
	}

	// MARK: deviceScreenFreeze
	// Midra only
	get deviceScreenFreeze() {
		
		const deviceScreenFreeze: AWJfeedback<{screen: string}> = {
			type: 'boolean',
			name: 'Freeze - Screen (Midra/Alta)',
			sortName: '01 LIVE - 17 Freeze - Screen',
			description: 'Shows whether a screen currently is frozen',
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
					choices: [{id: 'any', label:'Any Screen'}, ...this.choices.getScreenAuxChoices()],
					default: this.choices.getScreenAuxChoices()[0]?.id,
				}
			],
			callback: (feedback) => {
				let retval = false
				let screens: string[]
				if (feedback.options.screen === 'any') {
					screens = this.choices.getScreensAuxArray().map(scr => scr.id)
				} else {
					screens = [feedback.options.screen]
				}
				for (const screen of screens) {
					const screeninfo = this.choices.getScreenInfo(screen)
					const path = ['DEVICE', 'device', screeninfo.prefixverylong + 'List', 'items', screeninfo.numstr, 'control', 'pp', 'freeze']
					if (this.state.get(path)) retval = true
				}
				return retval
			},
		}

		return deviceScreenFreeze
	}

	/**
	 * MARK: deviceOutputFreeze
	 * Aquilon only for now (LivePremier4's feedbacksToUse) - not yet confirmed whether Midra/Alta have an
	 * equivalent per-output freeze, so left unregistered there until tested (2026-09-08).
	 */
	get deviceOutputFreeze() {

		const outputChoices = this.choices.getOutputArray().map((out) => ({ id: `OUT${out.index}`, label: `Output ${out.index}${out.label ? ' - ' + out.label : ''}` }))

		const deviceOutputFreeze: AWJfeedback<{output: string}> = {
			type: 'boolean',
			name: 'LIVE - Output Freeze (Aquilon)',
			sortName: '01 LIVE - 18 Freeze - Output',
			description: 'Shows whether a physical Output currently is frozen',
			defaultStyle: {
				color: this.config.color_bright,
				bgcolor: combineRgb(0, 0, 100),
				png64:
					'iVBORw0KGgoAAAANSUhEUgAAADcAAAA3AQMAAACSFUAFAAABS2lUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4KPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNS42LWMxMzggNzkuMTU5ODI0LCAyMDE2LzA5LzE0LTAxOjA5OjAxICAgICAgICAiPgogPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4KICA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIi8+CiA8L3JkZjpSREY+CjwveDp4bXBtZXRhPgo8P3hwYWNrZXQgZW5kPSJyIj8+IEmuOgAAAARnQU1BAACxjwv8YQUAAAABc1JHQgCuzhzpAAAABlBMVEUAAABfXKLsUQDeAAAAAXRSTlMAQObYZgAAAM9JREFUGNONkTEOwjAMRX9UpDC1nIBwEKRyJCMGmNogDsCRyMY1wg26ESTUYLc1sEGWp1h2/vcPABDG84MrWoxXOgxcUycol7tbEFb748Aim4HmKZyXSCZsUFpQwQ1OeIqorsxzQHFnXgCTmT3PtczErD1ZEXCBXJR6RzXXzSNR3wA2NrvkPCpf52gDZnDZw3Oj7Ue/xfObM9gMSL/LgfttbHPH8+bRb+U9tIla0XVx1FP9yY/6U7/qX/fR/XRf3f+Th+Yz5aX5vfPUfP/6jxdhImTMvNrBOgAAAABJRU5ErkJggg==',
			},
			options: [
				{
					id: 'output',
					type: 'dropdown',
					label: 'Output',
					choices: outputChoices,
					default: outputChoices[0]?.id,
					allowInvalidValues: true,
				},
			],
			callback: (feedback) => {
				const match = (feedback.options.output ?? '').toString().match(/^(?:OUT)?(\d+)$/i)
				// The OUT{n}.freeze variable itself is maintained for every available output independently of
				// this feedback (subscriptions.outputFreeze), so nothing to do here beyond the boolean result.
				return match ? !!this.state.get('DEVICE/device/outputList/items/' + match[1] + '/control/pp/freeze') : false
			},
		}

		return deviceOutputFreeze
	}

	// MARK: timerState
	get timerState() {
		
		const timerState: AWJfeedback<{timer: string, state: string }> = {
			type: 'boolean',
			name: 'Timers - State',
			sortName: '04 Timers - State',
			description: 'Shows whether a timer is currently stopped or running',
			defaultStyle: {
				color: this.config.color_dark,
				bgcolor: this.config.color_highlight,
			},
			options: [
				{
					id: 'timer',
					type: 'dropdown',
					label: 'Timer',
					choices: this.choices.getTimerChoices(),
					default: this.choices.getTimerChoices()[0]?.id,
				},
				{
					id: 'state',
					type: 'dropdown',
					label: 'State',
					choices: [
						{ id: 'RUNNING', label: 'Running' },
						{ id: 'PAUSED', label: 'Paused' },
						{ id: 'IDLE', label: 'Stopped' },
						{ id: 'ELAPSED', label: 'Elapsed' },
					],
					default: 'RUNNING',
				},
			],
			callback: (feedback) => {
				return (
					this.state.get('DEVICE/device/timerList/items/' + feedback.options.timer + '/status/pp/state') ===
					feedback.options.state
				)
			},
		}

		return timerState
	}

	// MARK: deviceGpioOut
	// LivePremier only
	get deviceGpioOut() {
		
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
					tooltip: 'GPO number 1-8 for device #1, 9-16 for #2, 17-24 for #3, 25-32 for #4'
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
			callback: () => {
				return false
			},
		}

		return deviceGpioOut
	}

	// MARK: deviceGpioIn
	// LivePremier only
	get deviceGpioIn() {
		
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
					max: 8,
					range: true,
					default: 1,
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
			callback: () => {
				return false
			},
		}

		return deviceGpioIn
	}

	// MARK: deviceCustom
	get deviceCustom() {
		type FeedbackDeviceCustomOptions = {
			path: string,
			valuetype: string,
			actionst: string,
			textValue: string,
			actionsn: string,
			numericValue: number,
			numericValue2: number,
			invert: boolean,
			variable: string
		}
		
		const deviceCustom: AWJfeedback<FeedbackDeviceCustomOptions> = {
			type: 'boolean',
			name: 'Custom Feedback',
			sortName: '09 Custom Feedback',
			description: 'Generates feedback and a variable from a custom AWJ path',
			defaultStyle: {
				color: this.config.color_dark,
				bgcolor: this.config.color_highlight,
			},
			options: [
				{
					type: 'textinput',
					id: 'path',
					label: 'path',
					default: '',
					regex: `/${regexAWJpath}/`,
					tooltip: 'AWJ path of property to watch for, enter a path to exactly one property with no wildcards.\nPGM/PRW (PVW also still works) can be used for the presets and will be replaced dynamically.'
				},
				{
					type: 'dropdown',
					id: 'valuetype',
					label: 'Evaluate value as type',
					choices: [
						{ id: 't', label: 'Text' },
						{ id: 'n', label: 'Number' },
						{ id: 'b', label: 'Boolean' },
						{ id: 'o', label: 'Object' },
					],
					default: 't',
					disableAutoExpression: true,
				},
				{
					type: 'dropdown',
					id: 'actionst',
					label: 'Check',
					choices: [
						{ id: '1', label: 'Text equals' },
						{ id: '2', label: 'Text contains' },
						{ id: '3', label: 'Text length is' },
						{ id: '4', label: 'Text matches regular expression' },
					],
					default: '1',
					isVisibleExpression: "$(options:valuetype) == 't'",
				},
				{
					type: 'textinput',
					id: 'textValue',
					label: 'value',
					default: '',
					isVisibleExpression: "$(options:valuetype) == 't'",
				},
				{
					type: 'dropdown',
					id: 'actionsn',
					label: 'Check',
					choices: [
						{ id: '==', label: 'Number equals' },
						{ id: '>', label: 'Number is greater than' },
						{ id: '...', label: 'Number is in range between value and value2' },
						{ id: '%', label: 'Number modulo value is value2' },
					],
					default: '==',
					isVisibleExpression: "$(options:valuetype) == 'n'",
					disableAutoExpression: true,
				},
				{
					type: 'number',
					id: 'numericValue',
					label: 'value1',
					default: 0,
					min: -Number.MAX_VALUE,
					max: Number.MAX_VALUE,
					isVisibleExpression: "$(options:valuetype) == 'n'",
				},
				{
					type: 'number',
					id: 'numericValue2',
					label: 'value 2',
					default: 0,
					min: -Number.MAX_VALUE,
					max: Number.MAX_VALUE,
					isVisibleExpression: "$(options:valuetype) == 'n' && ($(options:actionsn) == '...' || $(options:actionsn) == '%')",
				},
				{
					type: 'checkbox',
					id: 'invert',
					label: 'Invert feedback result',
					default: false,
				},
				{
					type: 'textinput',
					id: 'variable',
					label: 'Custom Name of Variable to use',
					default: '',
					regex: '/^[A-Za-z0-9_-]*$/',
					tooltip: 'Can be left empty, if filled this will be the name of the variable with the value of the feedback.\nOnly letters, numbers, underscore and minus is allowed.'
				}
			],
			learn: (feedback) => {
				const newoptions = {
				}
				const lastMsg = this.state.get('LOCAL/lastMsg')
				const path = lastMsg.path
				const value = lastMsg.value
				if (JSON.stringify(value).length > 132) {
					return undefined
				}
				newoptions['path'] = this.instance.jsonToAWJpath(path)
				switch (typeof value) {
					case 'string':
						newoptions['valuetype'] = 't'
						newoptions['actionst'] = '1'
						newoptions['textValue'] = value
						break
					case 'number':
						newoptions['valuetype'] = 'n'
						newoptions['actionsn'] = '=='
						newoptions['numericValue'] = value
						break
					case 'boolean':
						newoptions['valuetype'] = 'b'
						break
					case 'object':
						newoptions['valuetype'] = 'o'
				}

				return {
					...feedback.options,
					...newoptions,
				}
			},
			callback: (feedback: CompanionFeedbackBooleanEvent & { options: FeedbackDeviceCustomOptions }) => {
				{
					// register the subscription pattern and custom variable for this feedback instance (idempotent, safe to repeat on every check)
					let subVarId = ''
					const sub = {}
					let subVarname = `Custom Variable for Path ${feedback.options.path}`
					if (feedback.options.path.match(regexAWJpath) !== null) {
						// we got a path to work with
						subVarname = `Custom Variable for Feedback ${feedback.options.path}`
						if (feedback.options.variable.match(/[A-Za-z0-9_-]+/) !== null) {
							subVarId = feedback.options.variable.replace(/[^A-Za-z0-9_-]/g, '')
						} else {
							subVarId = feedback.options.path.replace(/\//g, '_').replace(/[^A-Za-z0-9_-]/g, '')
						}
						const parts = this.instance.AWJtoJsonPath(feedback.options.path)

						if (
							parts[4] === 'presetList' &&
							parts[5] === 'items' &&
							parts[6] &&
							feedback.options.path.split('/')[6]?.match(/^(PGM|PVW|PRW|program|preview)$/i) !== null
						) {
							parts[6] = '(\\w+?)'
							sub[`${feedback.id}-take`] = {
								pat: 'DEVICE/device/(screenGroup|screenAuxGroup|transition/screen)List/items/(\\w+?)/status/pp/transition',
								fbk: `id:${feedback.id}`,
							}
						}

						sub[feedback.id] = {
							pat: parts.join('/'),
							fbk: `id:${feedback.id}`
						}
						this.instance.subscriptions.addSubscriptions(sub)
					} else {
						// we got no valid path
						subVarname = `Custom Variable for Feedback ${feedback.id}`
						if (feedback.options.variable !== '') {
							subVarId = feedback.options.variable
						} else {
							subVarId = feedback.id
						}
					}
					this.instance.addVariable({
						id: feedback.id,
						variableId: subVarId,
						name: subVarname,
					})
				}

				let ret = false
				const path = this.instance.AWJtoJsonPath(feedback.options.path)
				if (path.length < 2) {
					return false
				}
				const value = this.state.get(['DEVICE', ...path])
				let varId = feedback.options.variable.replace(/[^A-Za-z0-9_-]/g, '')
				if (varId === '') varId = feedback.options.path.replace(/\//g, '_').replace(/[^A-Za-z0-9_-]/g, '')

				if (value === undefined) {
					this.instance.setVariableValues({ [varId]: undefined })
				} else if (value === null) {
					this.instance.setVariableValues({ [varId]: 'null' })
				} else if (feedback.options.valuetype === 't') {
					const valuet: string = (typeof value === 'string') ? value : JSON.stringify(value)
					this.instance.setVariableValues({ [varId]: valuet })
					switch (feedback.options.actionst) {
						case '1':
							ret = (valuet === feedback.options.textValue)
							break
					
						case '2':
							ret = valuet.includes(feedback.options.textValue)
							break
					
						case '3':
							ret = (valuet.length === parseInt(feedback.options.textValue))
							break
					
						case '4':
							ret = valuet.match(new RegExp(feedback.options.textValue)) !== null
							break
					
						default:
							break
					}
				} else if (feedback.options.valuetype === 'n') {
					const valuen = Number(value)
					this.instance.setVariableValues({ [varId]: valuen })
					switch (feedback.options.actionsn) {
						case '==':
							ret = (valuen === feedback.options.numericValue)
							break
					
						case '>':
							ret = (valuen > feedback.options.numericValue)
							break
					
						case '...':
							if (feedback.options.numericValue2 > feedback.options.numericValue)
								ret = (valuen >= feedback.options.numericValue && valuen <= feedback.options.numericValue2)
							else
								ret = (valuen >= feedback.options.numericValue2 && valuen <= feedback.options.numericValue)
							break

						case '%':
							ret = (valuen % feedback.options.numericValue === feedback.options.numericValue2)
							break
					
						default:
							break
					}
				} else if (feedback.options.valuetype === 'b') {
					if (typeof value === 'boolean') {
						ret = value
					} else if (typeof value === 'number') {
						ret = value >= 0.5 ? true : false
					} else if (typeof value === 'string') {
						ret = value.match(/^(y(es)?|true|0*1|go|\+|right|correct|ok(ay)?)$/i) !== null
					}
					const bool = parseBoolean(feedback.options.invert) ? !ret : ret
					this.instance.setVariableValues({ [varId]: bool ? 1 : 0 })
				} else if (feedback.options.valuetype === 'o') { 
					const valueo = JSON.stringify(value)
					this.instance.setVariableValues({ [varId]: valueo })
					ret = valueo.length > 0
				}
				return parseBoolean(feedback.options.invert) ? !ret : ret
			},
			unsubscribe: (feedback) => {
				this.instance.subscriptions.removeSubscription(feedback.id)
				this.instance.subscriptions.removeSubscription(feedback.id + '-take')
				this.instance.removeVariable(feedback.id)
			}
		}

		return deviceCustom
	}

	/**
	 * MARK: Testpattern Active (shared)
	 * Shared implementation for the platform-specific "Testpattern Active" feedbacks (mirrors the structure of
	 * deviceTestpatterns_common in actions.ts, one options field set per platform since the pattern choices and
	 * Input Group availability differ). True when the selected screen/output/input's testpattern currently
	 * equals the selected pattern AND patterns are actually enabled there (inhibit false) - a bare "type" match
	 * isn't enough on its own, since the device keeps the last-selected type value even after the pattern gets
	 * disabled, so without the inhibit check the feedback would stay stuck "on" after switching patterns off.
	 * "Off"/NONE/NO_PATTERN is the one exception: that's true exactly when inhibit is true, regardless of type.
	 * Needs the matching testpatternActive subscription (subscriptions.ts) to actually react to live changes -
	 * a feedback's callback alone is only re-run once, not on every device update.
	 */
	deviceTestpatternActive_common(options: CompanionInputFieldDropdown[], name = 'Testpattern Active') {
		type DeviceTestpatternActive = {group: string, screenList: string, outputList: string, screenListPat: string, outputListPat: string, inputList?: string, inputListPat?: string}

		const deviceTestpatternActive: AWJfeedback<DeviceTestpatternActive> = {
			type: 'boolean',
			name: `Device - ${name}`,
			sortName: `07 Device - 03 ${name}`,
			description: 'Shows whether the selected Testpattern is currently active on the selected screen/output/input',
			defaultStyle: {
				color: this.config.color_dark,
				bgcolor: this.config.color_highlight,
			},
			options,
			callback: (feedback) => {
				const group = feedback.options.group
				const item = feedback.options[group as 'screenList' | 'outputList' | 'inputList']
				const pattern = feedback.options[`${group}Pat` as 'screenListPat' | 'outputListPat' | 'inputListPat']
				if (!item || !pattern) return false
				const path = ['DEVICE', 'device', group, 'items', item, 'pattern', 'control', 'pp']
				const inhibit = this.state.get([...path, 'inhibit'])
				if (pattern === 'NONE' || pattern === 'NO_PATTERN') return inhibit === true
				return inhibit === false && this.state.get([...path, 'type']) === pattern
			},
		}

		return deviceTestpatternActive
	}

	/**
	 * MARK: Testpattern Raster Box Active (shared)
	 * Shows whether a specific Raster Box (Format or AOI) is currently enabled on an output - reads the same
	 * pattern/control/pp/centering array the "Set Testpattern Raster Box" action writes to.
	 */
	deviceTestpatternRasterBoxActive_common(name: string) {
		type DeviceTestpatternRasterBoxActive = {output: string, box: string}

		const deviceTestpatternRasterBoxActive: AWJfeedback<DeviceTestpatternRasterBoxActive> = {
			type: 'boolean',
			name: `Device - ${name}`,
			sortName: `07 Device - 04 ${name}`,
			description: 'Shows whether the selected Raster Box (Format/AOI) is currently enabled on the selected output',
			defaultStyle: {
				color: this.config.color_dark,
				bgcolor: this.config.color_highlight,
			},
			options: [
				{
					id: 'output',
					type: 'dropdown',
					label: 'Output or Output Group',
					choices: this.choices.getOutputChoices(),
					default: this.choices.getOutputChoices()[0]?.id,
				},
				{
					id: 'box',
					type: 'dropdown',
					label: 'Raster Box',
					choices: [
						{ id: 'FORMAT', label: 'Format' },
						{ id: 'AOI', label: 'AOI' },
					],
					default: 'FORMAT',
				},
			],
			callback: (feedback) => {
				const current: string[] = this.state.get(['DEVICE', 'device', 'outputList', 'items', feedback.options.output, 'pattern', 'control', 'pp', 'centering']) ?? []
				return Array.isArray(current) && current.includes(feedback.options.box)
			},
		}

		return deviceTestpatternRasterBoxActive
	}

	/**
	 * MARK: Thumbnail
	 * Shows a periodically-refreshed live preview image (Input/Output/Still Image Store/Timer) on the button,
	 * fetched from the device's REST snapshot API (`/api/device/snapshots/{category}/{n}`, PNG up to 256x256,
	 * see AWJconnection.getSnapshot). The device limits snapshot requests to 1/second per item, so polling is
	 * done via a shared interval per `${source}:${item}` (thumbnailPollers) - multiple buttons watching the
	 * same source/item share one poll instead of each hammering the device on their own; if their configured
	 * Refresh Rates differ, the fastest one wins for that shared poller.
	 *
	 * Must be an 'advanced' feedback, not 'boolean': a boolean feedback's style comes from a single fixed
	 * `defaultStyle` set once at registration, so it cannot return a different (freshly-fetched) png64 per
	 * button/per poll tick - only 'advanced' feedbacks return their style live from the callback. (Companion's
	 * own types flag 'advanced' as discouraged/likely-to-be-removed in a future major version, but it is
	 * currently the only mechanism in the v2 module API that supports a feedback-driven dynamic image.)
	 *
	 * There is no `subscribe` hook in Companion's feedback API (v2.1.3) to start the poller when the feedback
	 * is added - so, like deviceCustom above, registration happens lazily and idempotently on the feedback's
	 * own callback (every invocation just confirms the shared poller still matches this feedback's current
	 * options), and is torn down in `unsubscribe`.
	 */
	get deviceThumbnail(): CompanionAdvancedFeedbackDefinition {
		// Built fresh every time this getter runs (updateInstance(), e.g. on connect and on relevant live
		// isAvailable changes - same refresh mechanism every other live-state-driven choice list in this module
		// already relies on, see e.g. deviceTestpatterns_common's screenList/outputList/inputList).
		// Live-confirmed on a real Aquilon (192.168.20.112): despite the protocol doc's "images" range reading
		// 1-192 (matching the Library's own capacity), the snapshot endpoint actually only ever returns real
		// content for indices within the Image *Store*'s range (~24, whatever is actually loaded/usable as a
		// layer source right now) - a Library-only index (valid, uploaded, but not currently loaded into a
		// Store slot) returns a fixed ~875 byte placeholder (solid black) every time, confirmed by fetching
		// several such indices and getting byte-for-byte identical tiny responses. There is no way to snapshot
		// an arbitrary Library image this way, only what's actually live in a Store slot - so "Still Image
		// (Library)" was removed entirely rather than silently showing black for most of its own choice list.
		// All four categories are pooled into one flat "Source" dropdown (id prefixed with its category, e.g.
		// 'outputs:1') instead of a "pick category, then pick item" two-step - avoids the same kind of
		// method-style indirection already removed elsewhere in this module.
		const outputChoices = this.choices.getOutputArray()
			.filter((o) => !this.choices.getMultiviewerOutputListKeys().includes(o.id))
			.map((o) => ({ id: `outputs:${o.id}`, label: `Output ${o.id}${o.label ? ' - ' + o.label : ''}` }))
		const inputChoices = this.choices.getLiveInputArray().map((inp) => ({
			id: `inputs:${inp.index ?? inp.id.replace(/^\D+/, '')}`,
			label: `Input ${inp.index}${inp.label ? ' - ' + inp.label : ''}`,
		}))
		const storeChoices = this.choices.getStillsArray().map((s) => ({
			id: `imagesStore:${s.id}`,
			label: `Store ${s.id}${s.label ? ' - ' + s.label : ''}`,
		}))
		const timerChoices = this.choices.getTimerArray().map((t) => ({
			id: `timers:${t.index ?? t.id.replace(/^\w+_/, '')}`,
			label: `Timer ${t.index}${t.label ? ' - ' + t.label : ''}`,
		}))
		const sourceChoices = [...outputChoices, ...inputChoices, ...storeChoices, ...timerChoices]

		const deviceThumbnail: CompanionAdvancedFeedbackDefinition = {
			type: 'advanced',
			name: 'LIVE - Show Thumbnail',
			sortName: '01 LIVE - 12 Show Thumbnail',
			description: 'Shows a live preview image of an input, output or still image. Warning: using this feedback extensively (many buttons/short Refresh Rates) may significantly increase CPU load, depending on the Companion device it runs on.',
			affectedProperties: ['png64'],
			options: [
				{
					id: 'source',
					type: 'dropdown',
					label: 'Source',
					choices: sourceChoices,
					default: sourceChoices[0]?.id,
					allowInvalidValues: true,
				},
				{
					id: 'refreshRate',
					type: 'number',
					label: 'Refresh Rate (seconds)',
					min: 1,
					max: 120,
					default: 5,
				},
			],
			callback: (feedback): CompanionAdvancedFeedbackResult => {
				if (!parseBoolean(this.config.allowLiveThumbnails)) return {}

				const raw = String(feedback.options.source ?? '')
				const sepIdx = raw.indexOf(':')
				if (sepIdx === -1) return {}
				const source = raw.slice(0, sepIdx) as 'inputs' | 'outputs' | 'imagesStore' | 'timers'
				const itemId = raw.slice(sepIdx + 1)
				const requestedRate = Math.min(120, Math.max(1, Math.round(Number(feedback.options.refreshRate)) || 5))
				if (itemId === '') return {}
				const key = `${source}:${itemId}`

				const prevKey = this.thumbnailFeedbackKey.get(feedback.id)
				if (prevKey !== key) {
					if (prevKey) this.releaseThumbnailPoller(prevKey, feedback.id)
					this.thumbnailFeedbackKey.set(feedback.id, key)
				}

				let poller = this.thumbnailPollers.get(key)
				if (!poller) {
					poller = { timer: null, activeRate: 1, busy: false, subscribers: new Map(), source, itemId }
					this.thumbnailPollers.set(key, poller)
				} else {
					poller.source = source
					poller.itemId = itemId
				}
				poller.subscribers.set(feedback.id, { rate: requestedRate, lastSeen: Date.now() })

				// Deliberately NOT an immediate this.pollThumbnail(key) here - Companion invokes this callback
				// once even for a preset-browser preview that never becomes a real placed button (see the
				// thumbnailPollers field comment above), so firing a request straight from the callback would
				// hit the device the instant a row is rendered, before there's any way to tell a preview apart
				// from a real button. Leaving the first fetch to recalculateThumbnailThrottle()'s own interval
				// means a preview that disappears before its first tick (activeRate, e.g. 5s) never costs a
				// single device request - a real button just shows its first image one tick later instead.
				this.recalculateThumbnailThrottle()

				const cached = this.thumbnailCache.get(key)
				return cached ? { png64: cached } : {}
			},
			unsubscribe: (feedback) => {
				const key = this.thumbnailFeedbackKey.get(feedback.id)
				if (key) {
					this.releaseThumbnailPoller(key, feedback.id)
					this.recalculateThumbnailThrottle()
				}
				this.thumbnailFeedbackKey.delete(feedback.id)
			},
		}

		return deviceThumbnail
	}

	/** What to actually request for one poller. Live-confirmed on a real Aquilon: the snapshot API's "images"
	 *  category addresses the Image Store's own slot numbers directly - despite what the protocol doc's stated
	 *  range suggests, it does NOT address the Library, so no resolution/indirection is needed or possible here
	 *  (see the "Still Image (Library)" removal note on deviceThumbnail above). */
	private resolveThumbnailFetchTarget(source: 'inputs' | 'outputs' | 'imagesStore' | 'timers', itemId: string): { category: 'inputs' | 'outputs' | 'images' | 'timers', id: string } {
		return { category: source === 'imagesStore' ? 'images' : source, id: itemId }
	}

	private pollThumbnail(key: string): void {
		const poller = this.thumbnailPollers.get(key)
		if (!poller || poller.busy) return

		// Drop any subscriber that hasn't renewed itself in a while - most likely a one-off preset-browser
		// preview render (see the class-field comment above), never a real placed button, which keeps renewing
		// itself forever via its own poll -> checkFeedbacksById -> callback cycle. If that empties the poller
		// out entirely, self-terminate instead of polling for nobody.
		const now = Date.now()
		for (const [fid, sub] of poller.subscribers) {
			if (now - sub.lastSeen > Math.max(this.thumbnailSubscriberTtlMs, sub.rate * 1000 * 3)) {
				poller.subscribers.delete(fid)
			}
		}
		if (poller.subscribers.size === 0) {
			if (poller.timer !== null) clearInterval(poller.timer)
			this.thumbnailPollers.delete(key)
			this.thumbnailCache.delete(key)
			return
		}

		const target = this.resolveThumbnailFetchTarget(poller.source, poller.itemId)
		poller.busy = true
		this.instance.connection.getSnapshot(target.category, target.id).then((base64) => {
			poller.busy = false
			if (base64) {
				this.thumbnailCache.set(key, base64)
				for (const fid of poller.subscribers.keys()) this.instance.checkFeedbacksById(fid)
			}
		}).catch(() => {
			poller.busy = false
		})
	}

	/** Global throttle across all active thumbnail pollers: above thumbnailThrottleThreshold distinct polls,
	 *  stretches every poller's interval so the combined poll rate stays near that same number instead of
	 *  growing unbounded with every extra thumbnail on a page. A poller's own requested rate (the slowest of
	 *  its subscribing buttons' Refresh Rate options) is always honored as a floor - this can only slow pollers
	 *  down further, never speed them up beyond what was asked for. Called whenever the poller count changes
	 *  (a feedback (re-)registers or unsubscribes) so the throttle adapts up and back down again live. */
	private recalculateThumbnailThrottle(): void {
		const count = this.thumbnailPollers.size
		const globalMinInterval = count > this.thumbnailThrottleThreshold ? Math.ceil(count / this.thumbnailThrottleThreshold) : 1
		for (const [key, poller] of this.thumbnailPollers) {
			const requestedRate = poller.subscribers.size > 0 ? Math.min(...Array.from(poller.subscribers.values()).map((s) => s.rate)) : 1
			const actualRate = Math.max(requestedRate, globalMinInterval)
			if (poller.timer === null || poller.activeRate !== actualRate) {
				if (poller.timer !== null) clearInterval(poller.timer)
				poller.activeRate = actualRate
				poller.timer = setInterval(() => this.pollThumbnail(key), actualRate * 1000)
			}
		}
	}

	/** Immediately stops all thumbnail polling, e.g. when the "Allow Live Thumbnails" config checkbox is turned
	 *  off - called from index.ts's configUpdated(). A feedback's own callback re-registers its poller from
	 *  scratch the next time it runs (e.g. via checkFeedbacks('deviceThumbnail') when the checkbox is turned
	 *  back on), so clearing everything here is safe and does not need any other bookkeeping to stay in sync. */
	public stopAllThumbnailPollers(): void {
		for (const poller of this.thumbnailPollers.values()) {
			if (poller.timer !== null) clearInterval(poller.timer)
		}
		this.thumbnailPollers.clear()
		this.thumbnailCache.clear()
		this.thumbnailFeedbackKey.clear()
	}

	private releaseThumbnailPoller(key: string, feedbackId: string): void {
		const poller = this.thumbnailPollers.get(key)
		if (!poller) return
		poller.subscribers.delete(feedbackId)
		if (poller.subscribers.size === 0) {
			if (poller.timer !== null) clearInterval(poller.timer)
			this.thumbnailPollers.delete(key)
			this.thumbnailCache.delete(key)
		}
	}

	/**
	 * MARK: Backups - Active Backup Source
	 * Mirrors "Backups - Set Backup Set to Source" (deviceBackupSetSource action) - same target resolution
	 * (choices.getBackupControlPath) and the same underlying xSelectSlot state field. First draft: LivePremier/
	 * LivePremier4 only (Backup does not exist on Midra), firmware 6.0.4+ (see choices.isFirmwareAtLeast).
	 */
	get deviceBackupSetSourceStatus() {
		type DeviceBackupSetSourceStatus = { target: string, source: string }

		if (!this.choices.isFirmwareAtLeast('6.0.4')) {
			const deviceBackupSetSourceStatus: CompanionBooleanFeedbackDefinition = {
				type: 'boolean',
				name: 'Backups - Active Backup Source (Aquilon)',
				sortName: '08 Backups - 01 Active Backup Source',
				description: 'Shows which source (Primary/Backup1/Backup2) is currently active for a Backup Set (or every Set in a Backup Group). Requires device firmware 6.0.4 or newer.',
				defaultStyle: {
					color: this.config.color_dark,
					bgcolor: this.config.color_highlight,
				},
				options: [],
				callback: () => false,
			}
			return deviceBackupSetSourceStatus
		}

		const deviceBackupSetSourceStatus: AWJfeedback<DeviceBackupSetSourceStatus> = {
			type: 'boolean',
			name: 'Backups - Active Backup Source (Aquilon)',
			sortName: '08 Backups - 01 Active Backup Source',
			description: 'Shows which source (Primary/Backup1/Backup2) is currently active for a Backup Set (or every Set in a Backup Group).',
			defaultStyle: {
				color: this.config.color_dark,
				bgcolor: this.config.color_highlight,
			},
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
			callback: (feedback) => {
				const path = this.choices.getBackupControlPath(feedback.options.target)
				if (!path) return false
				// Reads status.pp.activeSlot (the actual current state, confirmed correct via the already-live
				// backups.setX.activeslot variable in refreshBackupVariables) - NOT control.pp.xSelectSlot,
				// which is only the last-requested switch command and does not track Auto Mode failovers.
				const statusPath = [...path.slice(0, -2), 'status', 'pp', 'activeSlot']
				return this.state.get(['DEVICE', ...statusPath]) === feedback.options.source
			},
		}

		return deviceBackupSetSourceStatus
	}

	/**
	 * MARK: Backups - Auto Mode Status
	 * Mirrors "Backups - Set Auto Mode" (deviceBackupAutoMode action) - same target resolution and the same
	 * underlying enableAutoSelect state field. First draft: LivePremier/LivePremier4 only, firmware 6.0.4+.
	 */
	get deviceBackupAutoModeStatus() {
		type DeviceBackupAutoModeStatus = { target: string, mode: string }

		if (!this.choices.isFirmwareAtLeast('6.0.4')) {
			const deviceBackupAutoModeStatus: CompanionBooleanFeedbackDefinition = {
				type: 'boolean',
				name: 'Backups - Auto Mode Status (Aquilon)',
				sortName: '08 Backups - 02 Auto Mode Status',
				description: 'Shows whether Auto Mode is currently on or off for a Backup Set (or every Set in a Backup Group). Requires device firmware 6.0.4 or newer.',
				defaultStyle: {
					color: this.config.color_dark,
					bgcolor: this.config.color_highlight,
				},
				options: [],
				callback: () => false,
			}
			return deviceBackupAutoModeStatus
		}

		const deviceBackupAutoModeStatus: AWJfeedback<DeviceBackupAutoModeStatus> = {
			type: 'boolean',
			name: 'Backups - Auto Mode Status (Aquilon)',
			sortName: '08 Backups - 02 Auto Mode Status',
			description: 'Shows whether Auto Mode is currently on or off for a Backup Set (or every Set in a Backup Group) - when on, the device automatically switches to a Backup source if the Primary signal is lost.',
			defaultStyle: {
				color: this.config.color_dark,
				bgcolor: this.config.color_highlight,
			},
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
					],
					default: 'on',
				},
			],
			callback: (feedback) => {
				const path = this.choices.getBackupControlPath(feedback.options.target)
				if (!path) return false
				const enabled = this.state.get(['DEVICE', ...path, 'enableAutoSelect'])
				return (feedback.options.mode === 'on') === !!enabled
			},
		}

		return deviceBackupAutoModeStatus
	}

	/**
	 * MARK: Preconfig - Background Set Source Status
	 * Mirrors "Preconfig - Set Background Set Source" - shows whether one specific output of a given
	 * Background Set currently shows the given content. Deliberately checks exactly one output at a time, not
	 * a whole multi-output Screen at once (per explicit user decision) - combine several instances of this
	 * feedback (one per output) into an AND feedback to check a whole Screen. No per-Screen selection here, same
	 * reasoning and the same real benefit as the matching action (2026-09-08): a single flat "Output" dropdown,
	 * in this module's own `OUT{n}` naming convention (choices.getBackgroundScreenOutputChoices()), listing
	 * every real output of every Screen needs no isVisibleExpression at all, so - unlike most other
	 * dynamic-per-target fields in this module - it stays fully expression/variable-capable, which matters here
	 * specifically to allow programming a whole dynamic Stream Deck page of Background Set sources from
	 * variables rather than one static button per output. Which Screen a given output belongs to is resolved
	 * live at callback time (choices.getScreenForOutput()) rather than encoded in the option id.
	 */
	get devicePreconfigBackgroundSetSourceStatus() {
		type DevicePreconfigBackgroundSetSourceStatus = { bgset: string, output: string, content: string }

		const bgsetChoices = Array.from({ length: 8 }, (_, i) => ({ id: (i + 1).toString(), label: `Background Set ${i + 1}` }))
		const outputChoices = this.choices.getBackgroundScreenOutputChoices()

		const devicePreconfigBackgroundSetSourceStatus: AWJfeedback<DevicePreconfigBackgroundSetSourceStatus> = {
			type: 'boolean',
			name: 'Preconfig - Background Set Source Status (Aquilon)',
			sortName: '06 Preconfig - Background Set Source Status',
			description: 'Shows whether one specific output of a given Background Set currently shows the given content (Live Input, Still Image, or None). Checks exactly one output at a time - combine several instances of this feedback (one per output) into an AND feedback to check a whole multi-output Screen.',
			defaultStyle: {
				color: this.config.color_dark,
				bgcolor: this.config.color_highlight,
			},
			options: [
				{
					id: 'bgset',
					type: 'dropdown',
					label: 'Background Set',
					choices: bgsetChoices,
					default: '1',
				},
				{
					id: 'output',
					type: 'dropdown',
					label: 'Output',
					choices: outputChoices,
					default: outputChoices[0]?.id,
					allowInvalidValues: true,
				},
				{
					id: 'content',
					type: 'dropdown',
					label: 'Expected Source',
					choices: this.choices.getBackgroundSetContentChoices(),
					default: 'NONE',
				},
			],
			callback: (feedback) => {
				// Accepts both the dropdown's own 'OUT{n}' choices and a bare number (e.g. from an expression
				// that only has the raw output number available) - same leniency spirit as allowInvalidValues.
				const output = (feedback.options.output ?? '').replace(/^OUT/i, '')
				const screen = this.choices.getScreenForOutput(output)
				if (!screen) return false
				const path = this.choices.getBackgroundSetOutputContentPath(screen, feedback.options.bgset, output)
				const content = this.choices.shortSourceToBackgroundContent(feedback.options.content)
				return this.state.get(['DEVICE', ...path]) === content
			},
		}

		return devicePreconfigBackgroundSetSourceStatus
	}

	/**
	 * MARK: Preconfig - Inputs - Input Keying Status
	 * Mirrors "Preconfig - Inputs - Set Input Keying" - shows whether an Input's own Chroma/Luma keying mode
	 * currently matches the selected value.
	 */
	get deviceInputKeyingStatus() {
		type DeviceInputKeyingStatus = { input: string, mode: string }

		const inputChoices = this.choices.getLiveInputArray().map((inp) => ({ id: `IN${inp.index}`, label: `Input ${inp.index}${inp.label ? ' - ' + inp.label : ''}` }))

		const deviceInputKeyingStatus: AWJfeedback<DeviceInputKeyingStatus> = {
			type: 'boolean',
			name: 'Preconfig - Inputs - Input Keying Status',
			sortName: '06 Preconfig - Inputs - Input Keying Status',
			description: 'Shows whether an Input\'s own Chroma/Luma/CremaTTe3D/Cut&Fill keying mode currently matches the selected value.',
			defaultStyle: {
				color: this.config.color_dark,
				bgcolor: this.config.color_highlight,
			},
			options: [
				{
					id: 'input',
					allowInvalidValues: true,
					type: 'dropdown',
					label: 'Input',
					tooltip: 'This module\'s own short id convention (IN{n}) - a bare number, or the raw AWJ id (e.g. IN_1/LIVE_1), is also accepted.',
					choices: inputChoices,
					default: inputChoices[0]?.id,
				},
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Mode',
					choices: [
						{ id: 'DISABLE', label: 'Keying Disabled' },
						{ id: 'CHROMA', label: 'Chroma Key' },
						{ id: 'LUMA', label: 'Luma Key' },
						{ id: 'CREMATTE3D', label: 'CremaTTe3D' },
						// Analog Way's release notes: input-level Cut&Fill was added in firmware 4.0.254 -
						// live-confirmed (2026-09-08) this is that same feature, not a separate protocol area.
						{ id: 'CUT_AND_FILL', label: this.choices.isFirmwareAtLeast('4.0.254') ? 'Cut&Fill' : 'Cut&Fill (requires at least firmware 4.0.254)' },
					],
					default: 'DISABLE',
				},
			],
			callback: (feedback) => {
				const match = (feedback.options.input ?? '').match(/^(?:IN_?|LIVE_)?(\d+)$/i)
				if (!match) return false
				const input = `IN_${match[1]}`
				const plug = this.state.get('DEVICE/device/inputList/items/' + input + '/status/pp/plug')
				return this.state.get(['DEVICE', 'device', 'inputList', 'items', input, 'plugList', 'items', plug, 'settings', 'keying', 'control', 'pp', 'mode']) === feedback.options.mode
			},
		}

		return deviceInputKeyingStatus
	}
}
