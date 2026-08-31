import {AWJinstance} from '../index.js'
import { Subscription } from '../../types/Subscription.js'
import { InstanceStatus } from '@companion-module/base'
import Constants from './constants.js'

/**
 * Class for managing and checking of the subscriptions.
 * A subscription is data of the device associated with a json path in the device model which we are interested in and need to react on changes.
 */
export default class Subscriptions {
	instance: AWJinstance
	subscriptions: Record<string, Subscription>
	constants: typeof Constants
	private debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {}
	private registeredBackupSetIndices: Set<number> = new Set()
	private registeredBackupGroupIndices: Set<number> = new Set()

	/**
	 * Runs `fn` once after `delayMs` of quiet on this `key` (repeated calls reset the timer) instead of
	 * immediately - coalesces a rapid burst of triggers into a single rebuild firing only once things settle.
	 * A throttle-with-trailing-edge variant (periodic updates even during a long continuous burst) was tried
	 * first, then deliberately rejected per explicit user direction: these variables are meant to reflect an
	 * end state for config-building, not to drive a live animation-following feedback - "wir benötigen keine
	 * laufende Variable als Feedback für die Positionen während der Animation". So even a long (e.g. 10s)
	 * continuous animation intentionally produces zero intermediate updates, only the correct final value once
	 * it stops - accepted tradeoff, not a bug.
	 * Added after a live-confirmed incident: dragging a layer's resize handle in WebRCS sends many rapid
	 * position updates per second, and refreshLayerVariables()/refreshBackupVariables() are full synchronous
	 * rebuilds (iterate every screen/layer or every input/group, remove+re-add every variable) - running one
	 * per individual drag-tick piled up enough back-to-back synchronous work to visibly stall the module's own
	 * event loop (reported: Companion's own "disable connection" command couldn't get through until the
	 * backlog drained - not just slow variable updates, but the connection briefly impossible to switch off).
	 */
	private debounce(key: string, delayMs: number, fn: () => void): void {
		clearTimeout(this.debounceTimers[key])
		this.debounceTimers[key] = setTimeout(fn, delayMs)
	}

	/**
	 * This member denotes the names of the subscriptions which are to be checked.
	 * May be overridden in child classes.
	 */
	readonly subscriptionsToUse: string[] = [
		// ******** Common ********
		'syncselection',
		// 'liveselection',
		// 'layerselection',
		// 'selectedLayerRect',
		// 'selectedLayerSelectionChange',
		// 'globalAnchorPointChange',
		// 'selectedLayerSourceChange',
		// 'selectedLayerSourceSignalChange',
		// 'selectedScreenChange',
		// 'widgetSelection',
		// 'screenLock',
		// 'sourceVisibility',
		// 'selectedPreset',
		// 'inputFreeze',
		// 'timerState',
		// 'gpioOut',
		// 'gpioIn',
		// 'screenTransitionTime',
		// 'screenMemoryLabel',
		// 'masterMemory',
		// 'masterMemoryLabel',
		// 'multiviewerMemoryLabel',
		// 'layerMemoryLabel',
		// 'stillLabel',
		// 'stillValid',
		// 'stillLibraryChange',
		// 'screenLabel',
		// 'auxscreenLabel',
		// 'screenEnabled',
		// 'liveInputsChange',
		// 'masterMemoriesChange',
		// 'screenMemoriesChange',
		// 'layerMemoriesChange',
		// 'multiviewerMemoriesChange',
		// 'layerCountChange',
		// 'memoryColorChange',
		// ******** LivePremier ********
		// 'presetToggle',
		// 'screenPreset',
		// 'screenMemoryChange',
		// 'screenMemoryModifiedChange',
		// 'screenTransitionTime',
		// 'screenMemoryLabel',
		// 'inputLabel',
		// 'shutdown',
		// ******** Midra ********
		// 'presetToggle',
		// 'screenPreset',
		// 'backgroundSet',
		// 'screenMemoryChange',
		// 'screenMemoryLabel',
		// 'screenMemoryModifiedChange',
		// 'auxMemoryLabel',
		// 'plugChange',
		// 'inputLabel',
		// 'auxMemoriesChange',
		// 'liveLayerFreeze',
		// 'backgroundLayerFreeze',
		// 'screenFreeze',
		// 'streamStatus',
		// 'standby',
		// 'shutdown',
	]

	constructor(instance: AWJinstance) {
		this.instance = instance
		this.constants = this.instance.constants

		this.subscriptions = Object.fromEntries(
            this.subscriptionsToUse.map((key) => [key, this[key]])
        )
	}

	/**
	 * Picks the old (V2) or new (V3) id for a dynamic variable, based on the "Use old (V2) variable names"
	 * config checkbox. Existing configs are upgraded to keep using the old names automatically (see upgrades.ts).
	 */
	varName(oldName: string, newName: string): string {
		return this.instance.config.useOldVariableNames ? oldName : newName
	}

	/**
	 * The names of the currently active subscriptions
	 */
	get subscriptionList() {
		return Object.keys(this.subscriptions)
	}

	/**
	 * Adds one or more subscriptions to the active subscriptions
	 * @param subscriptions Object containing one or more subscriptions 
	 */
	public addSubscriptions(subscriptions: Record<string, Subscription>): void {
		Object.keys(subscriptions).forEach(subscription => {
			this.subscriptions[subscription] = subscriptions[subscription]
		})
	}

	/**
	 * Removes the subscription with the given ID  from the active subscriptions
	 * @param subscriptionId ID of the subscription to remove
	 */
	public removeSubscription(subscriptionId: string): void {
		if (this.subscriptions[subscriptionId]) delete this.subscriptions[subscriptionId]
	}

	/**
	 * Get a specific subscription definition
	 * @param subscription 
	 * @returns 
	 */
	subscription(subscription: string) {
		return this.subscriptions[subscription]
	}

	/** Does a client sync its selection to server? */
	get syncselection():Subscription {
		return {
			pat: this.constants.subSyncselectionPat,
			fbk: 'syncselection',
		}
	}

	/** Selected screens change */
	get liveselection():Subscription {
		return {
			pat: 'live/screens/screenAuxSelection',
			fbk: 'liveScreenSelection',
		}
	}

	/** Selected layers change */
	get layerselection():Subscription {
		return {
			pat: 'live/screens/layerSelection/layerIds',
			fbk: 'remoteLayerSelection',
		}
	}

	/** Selected multiviewer widgets change */
	get widgetSelection():Subscription {
		return {
			pat: 'live/multiviewers?/widgetSelection',
			fbk: 'remoteWidgetSelection',
		}
	}

	/** Lock status of a screen changes */
	get screenLock():Subscription {
		return {
			pat: 'live/screens/presetModeLock/PR',
			fbk: 'liveScreenLock',
		}
	}

	/** Any parameter that has relevance for the visibility of a source changes (source, position, size, opacity, crop, mask) */
	get sourceVisibility():Subscription {
		return {
			pat: 'device/(auxiliaryScreen|screen|auxiliary)List/items/(S|A)?(\\d{1,3})/presetList/items/(\\w+)/l(iveL)?ayerList/items/(\\d{1,3}|NATIVE)/(source|position|size|opacity|crop|mask)',
			fbk: 'deviceSourceTally',
		}
	}

	/** A screen's/output's/input's testpattern (type or enable state) changes */
	get testpatternActive():Subscription {
		return {
			pat: 'device/(?:screenList|outputList|inputList)/items/\\w+/pattern/control/pp/(?:type|inhibit)',
			fbk: 'deviceTestpatternActive',
		}
	}

	/** An output's Raster Box (Format/AOI centering overlay) changes */
	get testpatternRasterBoxActive():Subscription {
		return {
			pat: 'device/outputList/items/\\w+/pattern/control/pp/centering',
			fbk: 'deviceTestpatternRasterBoxActive',
		}
	}

	/**
	 * Refreshes SelectedLayer.count plus the SelectedLayer.x/.y/.width/.height/.number and
	 * SelectedLayer.Input.Number/.Name/.width/.height variables for whichever layer was selected first
	 * (confirmed live: the device's layerIds array is in Ctrl-click order, not layer number order - the
	 * first entry is whichever layer was Ctrl-clicked first, not necessarily the lowest-numbered one).
	 * Deliberately scoped to only the first of the selection - not a per-layer variable set, which would be
	 * unbounded across many screens/layers - so this stays cheap: it just re-derives "who is selected right
	 * now" and reads that one layer's already locally-synced state (no live device query). Shared by
	 * selectedLayerRect (fires on position/size change), selectedLayerSelectionChange (selection changes),
	 * globalAnchorPointChange (anchor point changes) and selectedLayerSourceChange/
	 * selectedLayerSourceSignalChange (source reassigned or its signal changes), so the variables can't go
	 * stale from any of those.
	 */
	private refreshSelectedLayerRect = (): boolean => {
		const selectedLayers = this.instance.choices.getSelectedLayers()
		this.instance.setVariableValues({ 'SelectedLayer.count': selectedLayers.length })
		const layer = selectedLayers[0]
		if (layer && layer.layerKey.match(/^\d+$/)) {
			const screeninfo = this.instance.choices.getScreenInfo(layer.screenAuxKey)
			const presetKey = this.instance.choices.getPreset(screeninfo.id, this.instance.choices.getPresetSelection('sel'))
			const path = [
				...(screeninfo.isAux ? this.constants.auxPath : this.constants.screenPath),
				'items', screeninfo.platformId,
				'presetList', 'items', presetKey,
				...this.instance.choices.getLayerPath(layer.layerKey),
			]
			const sizeH = this.instance.state.get(['DEVICE', ...path, ...this.constants.propsSizePath, 'sizeH'])
			const sizeV = this.instance.state.get(['DEVICE', ...path, ...this.constants.propsSizePath, 'sizeV'])
			if (sizeH !== undefined && sizeV !== undefined) {
				const posH = this.instance.state.get(['DEVICE', ...path, ...this.constants.propsPositionPath, 'posH']) ?? 0
				const posV = this.instance.state.get(['DEVICE', ...path, ...this.constants.propsPositionPath, 'posV']) ?? 0
				const anchor = this.instance.choices.getGlobalAnchorPoint()
				const anchorPos = anchor === 'CENTER' ? { x: posH, y: posV } : this.instance.choices.convertAnchorPosition(posH, posV, sizeH, sizeV, 'CENTER', anchor)
				const source = this.instance.choices.getLayerSourceInfo(path)

				const opacity = this.instance.state.get(['DEVICE', ...path, 'opacity', 'pp', 'opacity'])

				// Classic crop is normalized against the *source's* native resolution, Mask against the
				// layer's own *current* on-screen size - confirmed live, see the "Layer Properties - Aspect &
				// Crop"/"...- Mask" actions' own comments for the full story. '' if the respective dimension
				// isn't known (e.g. Color/Timer source for crop - mask always has a size to normalize against).
				const toPixels = (raw: unknown, dimension: number | ''): number | '' =>
					typeof raw === 'number' && dimension !== '' ? Math.round(raw / 65536 * dimension) : ''
				const cropTop = this.instance.state.get(['DEVICE', ...path, 'cropping', 'classic', 'pp', 'top'])
				const cropBottom = this.instance.state.get(['DEVICE', ...path, 'cropping', 'classic', 'pp', 'bottom'])
				const cropLeft = this.instance.state.get(['DEVICE', ...path, 'cropping', 'classic', 'pp', 'left'])
				const cropRight = this.instance.state.get(['DEVICE', ...path, 'cropping', 'classic', 'pp', 'right'])
				const maskTop = this.instance.state.get(['DEVICE', ...path, 'cropping', 'mask', 'pp', 'top'])
				const maskBottom = this.instance.state.get(['DEVICE', ...path, 'cropping', 'mask', 'pp', 'bottom'])
				const maskLeft = this.instance.state.get(['DEVICE', ...path, 'cropping', 'mask', 'pp', 'left'])
				const maskRight = this.instance.state.get(['DEVICE', ...path, 'cropping', 'mask', 'pp', 'right'])

				this.instance.setVariableValues({
					'SelectedLayer.x': anchorPos.x,
					'SelectedLayer.y': anchorPos.y,
					'SelectedLayer.width': sizeH,
					'SelectedLayer.height': sizeV,
					'SelectedLayer.number': layer.layerKey,
					'SelectedLayer.Input.Number': source.number,
					'SelectedLayer.Input.Name': source.name,
					'SelectedLayer.Input.width': source.width,
					'SelectedLayer.Input.height': source.height,
					'SelectedLayer.opacity': typeof opacity === 'number' ? opacity : '',
					'SelectedLayer.Crop.Top': toPixels(cropTop, source.height),
					'SelectedLayer.Crop.Bottom': toPixels(cropBottom, source.height),
					'SelectedLayer.Crop.Left': toPixels(cropLeft, source.width),
					'SelectedLayer.Crop.Right': toPixels(cropRight, source.width),
					'SelectedLayer.Mask.Top': toPixels(maskTop, sizeV),
					'SelectedLayer.Mask.Bottom': toPixels(maskBottom, sizeV),
					'SelectedLayer.Mask.Left': toPixels(maskLeft, sizeH),
					'SelectedLayer.Mask.Right': toPixels(maskRight, sizeH),
				})
				return false
			}
		}
		// nothing selected, or the selected "layer" is the background/NATIVE layer, which has no position/size
		this.instance.setVariableValues({
			'SelectedLayer.x': '',
			'SelectedLayer.y': '',
			'SelectedLayer.width': '',
			'SelectedLayer.height': '',
			'SelectedLayer.number': '',
			'SelectedLayer.Input.Number': '',
			'SelectedLayer.Input.Name': '',
			'SelectedLayer.Input.width': '',
			'SelectedLayer.Input.height': '',
			'SelectedLayer.opacity': '',
			'SelectedLayer.Crop.Top': '',
			'SelectedLayer.Crop.Bottom': '',
			'SelectedLayer.Crop.Left': '',
			'SelectedLayer.Crop.Right': '',
			'SelectedLayer.Mask.Top': '',
			'SelectedLayer.Mask.Bottom': '',
			'SelectedLayer.Mask.Left': '',
			'SelectedLayer.Mask.Right': '',
		})
		return false
	}

	get selectedLayerRect():Subscription {
		return {
			pat: 'device/(auxiliaryScreen|screen|auxiliary)List/items/(S|A)?(\\d{1,3})/presetList/items/(\\w+)/l(iveL)?ayerList/items/(\\d{1,3}|NATIVE)/(position|size)',
			fun: this.refreshSelectedLayerRect,
		}
	}

	/** Selected layer changes - refreshes SelectedLayer.x/.y/.width/.height/.number and SelectedLayer.Input.*, see refreshSelectedLayerRect */
	get selectedLayerSelectionChange():Subscription {
		return {
			pat: 'live/screens/layerSelection/layerIds',
			fun: this.refreshSelectedLayerRect,
		}
	}

	/** The globally selected Anchor Point changes (from this module, WebRCS, or another client) */
	get globalAnchorPointChange():Subscription {
		return {
			pat: 'live/screens/layers/anchorPoint',
			fbk: 'globalAnchorPoint',
			fun: this.refreshSelectedLayerRect,
		}
	}

	/** A layer's assigned source changes (new input/still picked) - refreshes SelectedLayer.Input.*, see refreshSelectedLayerRect */
	get selectedLayerSourceChange():Subscription {
		return {
			pat: 'device/(auxiliaryScreen|screen|auxiliary)List/items/(S|A)?(\\d{1,3})/presetList/items/(\\w+)/l(iveL)?ayerList/items/(\\d{1,3}|NATIVE)/source/pp/inputNum',
			fun: this.refreshSelectedLayerRect,
		}
	}

	/** A live input's detected signal resolution changes - refreshes SelectedLayer.Input.width/.height
	 * if that input happens to be the selected layer's source, see refreshSelectedLayerRect */
	get selectedLayerSourceSignalChange():Subscription {
		return {
			pat: 'device/inputList/items/(\\w+)/plugList/items/(\\w+)/status/signal/pp/image(Width|Height)',
			fun: this.refreshSelectedLayerRect,
		}
	}

	/** The selected layer's opacity changes - refreshes SelectedLayer.opacity, see refreshSelectedLayerRect */
	get selectedLayerOpacityChange():Subscription {
		return {
			pat: 'device/(auxiliaryScreen|screen|auxiliary)List/items/(S|A)?(\\d{1,3})/presetList/items/(\\w+)/l(iveL)?ayerList/items/(\\d{1,3}|NATIVE)/opacity/pp/opacity',
			fun: this.refreshSelectedLayerRect,
		}
	}

	/** The selected layer's classic crop or mask changes - refreshes SelectedLayer.Crop.* and .Mask.*, see refreshSelectedLayerRect */
	get selectedLayerCroppingChange():Subscription {
		return {
			pat: 'device/(auxiliaryScreen|screen|auxiliary)List/items/(S|A)?(\\d{1,3})/presetList/items/(\\w+)/l(iveL)?ayerList/items/(\\d{1,3}|NATIVE)/cropping/(classic|mask)/pp/(top|bottom|left|right)',
			fun: this.refreshSelectedLayerRect,
		}
	}

	/** Any of the on/off-style Layer Properties fields deviceLayerPropertyStatus checks (Border Edge/Shadow
	 * style flags, Effects flags, Keying enable, Mask crop values) - same Layer-path prefix convention as
	 * selectedLayerCroppingChange above, covering every platform's screenList/auxiliaryScreenList/auxiliaryList
	 * and layerList/liveLayerList naming. */
	get layerPropertyStatusChange():Subscription {
		return {
			pat: 'device/(auxiliaryScreen|screen|auxiliary)List/items/(S|A)?(\\d{1,3})/presetList/items/(\\w+)/l(iveL)?ayerList/items/(\\d{1,3}|NATIVE)/(?:border/(?:edge|shadow)/pp/style|effects/pp/flags|keying/pp/enable|cropping/mask/pp/(?:top|bottom|left|right)|cropping/classic/pp/aspectOverride|transition/pp/flags)',
			fbk: 'deviceLayerPropertyStatus',
		}
	}

	/**
	 * Refreshes the SelectedScreen.number/.numberOfLayers/.tbarPosition/.TransitionTime.Pgm/.Pvw variables for
	 * whichever screen/aux is currently selected (the first one, if several are). Same "just the selection, not
	 * an unbounded per-screen set" scoping as refreshSelectedLayerRect above.
	 * tbarPosition is expressed 0-100 (not the device's raw 0-65535), matching the "Set T-Bar Position" action's
	 * own Position field at its default Maximum of 100 - so this variable can be fed straight back into that
	 * action (or the Percent field of a manual encoder build) without any conversion math.
	 * PGM/PVW direction for transition time mirrors deviceTakeTime's own mapping exactly: when the screen's
	 * current PGM side is preset A, takeUpTime is "Pgm" and takeDownTime is "Pvw" - and vice versa when PGM is B.
	 */
	private refreshSelectedScreen = (): boolean => {
		const screenId = this.instance.choices.getSelectedScreens()[0]
		if (!screenId) {
			this.instance.setVariableValues({
				'SelectedScreen.number': '',
				'SelectedScreen.numberOfLayers': '',
				'SelectedScreen.tbarPosition': '',
				'SelectedScreen.TransitionTime.Pgm': '',
				'SelectedScreen.TransitionTime.Pvw': '',
			})
			return false
		}

		const groupPath = [...this.constants.screenGroupPath, 'items', screenId, 'control', 'pp']
		const tbarRaw = this.instance.state.get(['DEVICE', ...groupPath, 'tbarPosition'])
		const takeUpTime = this.instance.state.get(['DEVICE', ...groupPath, 'takeUpTime'])
		const takeDownTime = this.instance.state.get(['DEVICE', ...groupPath, 'takeDownTime'])
		// Read presetUp directly off the same control object rather than choices.getPreset(id, 'PGM') - that
		// goes through LOCAL/screens/{screen}/pgm/preset, which is ONLY ever written by screenPreset's own
		// AT_UP/AT_DOWN transition handler and is never seeded from the device's actual current state at
		// connect time. Live-confirmed bug: on a screen that hadn't had a live Take/Cut since Companion
		// connected, this stayed stale/undefined indefinitely even though presetUp correctly showed 'B' -
		// found via refreshLayerVariables reading frozen, wrong layer content. presetUp is always live/correct.
		const presetPgm = this.instance.state.get(['DEVICE', ...groupPath, 'presetUp'])
		const pgmDeciseconds = presetPgm === 'A' ? takeUpTime : takeDownTime
		const pvwDeciseconds = presetPgm === 'A' ? takeDownTime : takeUpTime

		this.instance.setVariableValues({
			'SelectedScreen.number': screenId,
			'SelectedScreen.numberOfLayers': this.instance.choices.getLayerChoices(screenId, false).length,
			'SelectedScreen.tbarPosition': typeof tbarRaw === 'number' ? Math.round(tbarRaw / 65535 * 10000) / 100 : '',
			'SelectedScreen.TransitionTime.Pgm': typeof pgmDeciseconds === 'number' ? pgmDeciseconds / 10 : '',
			'SelectedScreen.TransitionTime.Pvw': typeof pvwDeciseconds === 'number' ? pvwDeciseconds / 10 : '',
		})
		return false
	}

	get selectedScreenChange():Subscription {
		return {
			pat: 'live/screens/screenAuxSelection',
			fun: this.refreshSelectedScreen,
		}
	}

	/** The selected screen's T-Bar position changes - refreshes SelectedScreen.tbarPosition, see refreshSelectedScreen.
	 * Built from this.constants.screenGroupPath rather than a hardcoded path since it differs per platform
	 * (confirmed: screenAuxGroupList on LivePremier4, screenGroupList on LivePremier, transition/screenList on
	 * Midra) - avoids needing a separate override of this subscription in each platform's own file. */
	get selectedScreenTbarChange():Subscription {
		return {
			pat: this.constants.screenGroupPath.join('/') + '/items/(S|A)?(\\d{1,3})/control/pp/tbarPosition',
			fun: this.refreshSelectedScreen,
		}
	}

	/** The selected screen's transition time changes - refreshes SelectedScreen.TransitionTime.Pgm/.Pvw, see
	 * refreshSelectedScreen. Same per-platform screenGroupPath reasoning as selectedScreenTbarChange above. */
	get selectedScreenTransitionTimeChange():Subscription {
		return {
			pat: this.constants.screenGroupPath.join('/') + '/items/(S|A)?(\\d{1,3})/control/pp/take(Up|Down)Time',
			fun: this.refreshSelectedScreen,
		}
	}

	/**
	 * Full live rebuild of every "Backups - " variable (backups.setX.*, backups.groupX.*) - NOT a "Selected"
	 * scoped pattern like refreshSelectedLayerRect/refreshSelectedScreen above, per explicit user request:
	 * every currently-existing Backup Set and Backup Group gets its own permanent, live-updating set of
	 * variables, all at once. Re-runs completely (remove all + re-add + re-set every value) on ANY relevant
	 * change rather than diffing, because the SET OF VARIABLES ITSELF has to track group membership live -
	 * a Backup Set's own variables must disappear the moment its input joins a Group, and reappear if it
	 * leaves one ("wenn das set teil einer gruppe wird, verschwinden die variablen für das set").
	 * X is a stable running index built from ascending IN_n / GROUP_n numeric order (the underlying AWJ id,
	 * confirmed maxInputs=256 / GROUP_1..GROUP_64 is the enum's own fixed bound) - NOT WebRCS's own
	 * user-reorderable Backup Sets list position - so numbering doesn't shift just because someone reorders
	 * their Backup Sets in WebRCS. It can still shift if a Set is added/removed/grouped, same tradeoff as
	 * every other sequentially-numbered dynamic variable set in this module (OUT{n}, MVW{n}, etc.).
	 * "enable" (confirmed live: true only for the exact inputs that have an actual Backup Set configured,
	 * false for all 250 untouched ones - there is no separate on/off switch for it in WebRCS, only Auto
	 * On/Off) is used purely as the existence filter, not exposed as its own variable.
	 */
	/**
	 * Matches the short id format already used by getSourceChoices()'s own ids (LIVE_n/STILL_n/NATIVE_n/
	 * SCREEN_n) plus a layer's own raw source id shape (IN_n/TIMER_n, confirmed live to differ from the
	 * Backup subsystem's LIVE_n for the same physical input), condensed to one INn/IMGn/BSn/SCRn/TIMERn
	 * convention meant to be reused by any future source-id-displaying variable in this module. "IMG" (not
	 * "STILL") per explicit user request, to match this module's own "Image Store"/"Image Library"
	 * terminology (see getStillStoreChoices() etc.) rather than the internal AWJ "Still" naming.
	 */
	private formatSourceShort(id: string | undefined): string {
		if (!id || id === 'NONE') return 'NONE'
		if (id === 'COLOR') return 'COLOR'
		const match = id.match(/^(LIVE|IN|STILL|NATIVE|SCREEN|TIMER)_(\d+)$/)
		if (!match) return id
		const prefixByKind: Record<string, string> = { LIVE: 'IN', IN: 'IN', STILL: 'IMG', NATIVE: 'BS', SCREEN: 'SCR', TIMER: 'TIMER' }
		return `${prefixByKind[match[1]]}${match[2]}`
	}

	/**
	 * An input's actual "has signal" state (independent of the Backup subsystem entirely, and independent of
	 * whether the input even has a Backup Set configured) - VALID/INVALID, this module's own simplified
	 * vocabulary (see [[project_variable_naming_conventions]]). Lives at plugList/items/{the plug
	 * status.pp.plug currently points to}/status/signal/pp/isValid - false with no cable connected, matching
	 * what the user recalled WebRCS's own Input menu evaluating. NOT the general input status.pp (isAvailable/
	 * isEnabled/global/hdcp - none of those reflect live signal presence, and per explicit user clarification
	 * the only administrative toggle on an input is WebRCS's "invisible in source picker" preconfig setting,
	 * which must never affect this module's own reporting - see
	 * [[feedback_preconfig_visibility_not_existence]]). Live-confirmed equivalent to the device's own
	 * WARNING_INVALID_CONTENT (a real backup slot pointed at a no-signal live input reported exactly that),
	 * before that was simplified to this module's plain VALID/INVALID vocabulary.
	 */
	private getInputSignalStatus(inputKey: string): string {
		const activePlug = this.instance.state.get(['DEVICE', 'device', 'inputList', 'items', inputKey, 'status', 'pp', 'plug']) ?? '1'
		const isValid = this.instance.state.get(['DEVICE', 'device', 'inputList', 'items', inputKey, 'plugList', 'items', activePlug, 'status', 'signal', 'pp', 'isValid'])
		return isValid ? 'VALID' : 'INVALID'
	}

	/**
	 * Cheap relevance pre-check for backupPrimarySignalChange, so a routine signal change on an input that has
	 * nothing to do with Backup (a laptop sleeping, a camera power-cycling, a cable swap) doesn't trigger a
	 * full refreshBackupVariables() rebuild - only an input that is itself a Backup Set, or is referenced as
	 * any backup-enabled input's Backup1/Backup2 slot source, is "relevant". Bounded scan (<=maxInputs), far
	 * cheaper than the full rebuild it gates. Added per explicit user request after live-testing revealed the
	 * unscoped version fires far more often than "only during an actual backup failover".
	 */
	private isInputRelevantToBackup(inputKey: string): boolean {
		if (this.instance.state.get(['DEVICE', 'device', 'inputList', 'items', inputKey, 'backup', 'control', 'pp', 'enable'])) return true
		const liveId = `LIVE_${inputKey.replace(/^\D+/, '')}`
		for (let i = 1; i <= this.constants.maxInputs; i += 1) {
			const key = `IN_${i}`
			const backup = this.instance.state.get(['DEVICE', 'device', 'inputList', 'items', key, 'backup'])
			if (!backup?.control?.pp?.enable) continue
			if (backup.slotList?.items?.['1']?.control?.pp?.source === liveId) return true
			if (backup.slotList?.items?.['2']?.control?.pp?.source === liveId) return true
		}
		return false
	}

	/**
	 * Cheap relevance pre-check for layerVariables' own input-signal watcher, same reasoning as
	 * isInputRelevantToBackup above - only an input actually assigned to some layer (numbered or background)
	 * on some currently-enabled screen/aux, on its PROGRAM side, is "relevant" (matches exactly what
	 * refreshLayerVariables itself reads and displays).
	 */
	private isInputShownOnAnyLayer(inputKey: string): boolean {
		const liveId = `LIVE_${inputKey.replace(/^\D+/, '')}`
		for (const scr of [...this.instance.choices.getScreensArray(), ...this.instance.choices.getAuxArray()]) {
			const info = this.instance.choices.getScreenInfo(scr.id)
			const screenListPath = info.isAux ? this.constants.auxPath : this.constants.screenPath
			const layerCount: number = this.instance.state.get(['DEVICE', ...screenListPath, 'items', info.platformId, 'status', 'pp', 'layerCount']) ?? 0
			const presetKey = this.instance.state.get(['DEVICE', ...this.constants.screenGroupPath, 'items', info.id, 'control', 'pp', 'presetUp'])
			const presetPath = [...screenListPath, 'items', info.platformId, 'presetList', 'items', presetKey]
			for (let i = 1; i <= layerCount; i += 1) {
				const layerPath = [...presetPath, ...this.instance.choices.getLayerPath(i)]
				if (this.instance.state.get(['DEVICE', ...layerPath, 'source', 'pp', 'inputNum']) === liveId) return true
			}
			const bgPath = [...presetPath, ...this.instance.choices.getLayerPath('NATIVE')]
			if (this.instance.state.get(['DEVICE', ...bgPath, 'source', 'pp', 'inputNum']) === liveId) return true
		}
		return false
	}

	/** Surgical per-index diffing, same reasoning/pattern as refreshLayerVariables/refreshScreenSize: a blanket
	 * removeVariable('backupVariables') here (the original approach) would make EVERY backup variable
	 * disappear and reappear on every single change, even a plain Auto Mode toggle where the SET of variables
	 * doesn't change at all - risking a live show, since Companion Triggers/Expressions watching "variable
	 * changed" could misfire on variables that didn't actually change, just got torn down and rebuilt. Now
	 * only the exact set/group index numbers that stopped existing get removeVariable'd; everything else's
	 * addVariable (idempotent) + setVariableValues (pure value update) never triggers a disappear/reappear. */
	private refreshBackupVariables = (): boolean => {
		const currentSetIndices = new Set<number>()
		const currentGroupIndices = new Set<number>()

		const formatSourceShort = (id: string | undefined): string => this.formatSourceShort(id)
		const slotLabel = (slot: string | undefined): string => (slot === '1' ? 'backup1' : slot === '2' ? 'backup2' : 'primary')

		// Deliberately NOT the device's own INPUT_BACKUP_SLOT_STATUS vocabulary (VALID/ERROR_.../WARNING_...)
		// - per explicit user request, simplified to a plain VALID/INVALID everywhere in this module, with our
		// own definition of "good": a slot must be BOTH configured (source !== NONE) AND report VALID from the
		// device. Live-confirmed this matters: the device itself reports status "VALID" for a slot whose
		// source is "NONE" (nothing wrong with an intentionally empty slot, from its own point of view) - but
		// an unconfigured slot is not a usable backup, so counts as INVALID here regardless of what AW itself
		// says. "VALID (= alle Signale liegen an) oder INVALID (= mindestens ein Slot ist nicht konfiguriert
		// oder hat kein Signal)".
		const slotStatus = (source: string | undefined, rawStatus: string | undefined): string =>
			source && source !== 'NONE' && rawStatus === 'VALID' ? 'VALID' : 'INVALID'
		// "Worst across members" collapses to: INVALID if any member is INVALID, else VALID (empty only if
		// there are no members at all, which shouldn't happen since a Group only appears here when in use).
		const worstStatus = (statuses: string[]): string => {
			if (statuses.length === 0) return ''
			return statuses.includes('INVALID') ? 'INVALID' : 'VALID'
		}
		const getPrimaryStatus = (inputKey: string): string => this.getInputSignalStatus(inputKey)

		// Collected while scanning inputs below, keyed by GROUP_n, so the group loop doesn't need its own
		// second 256-input scan.
		const backupSlotStatusByGroup: Record<string, { backup1: string; backup2: string; primary: string }[]> = {}

		let setIndex = 0
		for (let i = 1; i <= this.constants.maxInputs; i += 1) {
			const key = `IN_${i}`
			const backup = this.instance.state.get(['DEVICE', 'device', 'inputList', 'items', key, 'backup'])
			if (!backup?.control?.pp?.enable) continue
			const slot1 = backup.slotList?.items?.['1']
			const slot2 = backup.slotList?.items?.['2']
			const primaryStatus = getPrimaryStatus(key)
			const backup1Status = slotStatus(slot1?.control?.pp?.source, slot1?.status?.pp?.status)
			const backup2Status = slotStatus(slot2?.control?.pp?.source, slot2?.status?.pp?.status)
			const groupKey: string = backup.control.pp.group
			if (groupKey !== 'NONE') {
				(backupSlotStatusByGroup[groupKey] ??= []).push({ backup1: backup1Status, backup2: backup2Status, primary: primaryStatus })
				continue
			}
			setIndex += 1
			currentSetIndices.add(setIndex)
			const v = `backups.set${setIndex}`
			const primaryLabel = this.instance.state.get(['DEVICE', 'device', 'inputList', 'items', key, 'control', 'pp', 'label'])
			for (const [suffix, name] of [
				['activeslot', 'Active Slot'], ['activesource', 'Active Source'], ['automode', 'Auto Mode'],
				['primary.source', 'Primary Source'], ['primary.status', 'Primary Status'],
				['backup1.source', 'Backup1 Source'], ['backup1.status', 'Backup1 Status'],
				['backup2.source', 'Backup2 Source'], ['backup2.status', 'Backup2 Status'],
			]) {
				this.instance.addVariable({ id: 'backupVariables', variableId: `${v}.${suffix}`, name: `Backup Set ${setIndex}: ${name}` })
			}
			this.instance.setVariableValues({
				[`${v}.activeslot`]: slotLabel(backup.status?.pp?.activeSlot),
				[`${v}.activesource`]: formatSourceShort(backup.status?.pp?.activeSource),
				[`${v}.automode`]: backup.control.pp.enableAutoSelect,
				[`${v}.primary.source`]: primaryLabel || `Input ${i}`,
				[`${v}.primary.status`]: primaryStatus,
				[`${v}.backup1.source`]: formatSourceShort(slot1?.control?.pp?.source),
				[`${v}.backup1.status`]: backup1Status,
				[`${v}.backup2.source`]: formatSourceShort(slot2?.control?.pp?.source),
				[`${v}.backup2.status`]: backup2Status,
			})
		}

		// Background Set backups - structurally identical to Input backups (same control/status/slotList
		// shape, same backups.setX.*/backups.groupX.* variables, continuing the SAME setIndex/groupIndex
		// sequence) but per-Screen (live-confirmed 2026-08-28: DEVICE/device/preconfig/backgrounds/screenList/
		// items/{screen}/backgroundSetList/items/{1-8}/backup) rather than a single flat input list, and with
		// no live signal to check for "primary" validity - a Background Set's own status.pp.hasContentLoss
		// serves the same purpose instead (live-confirmed: assigning an empty/no-signal input as a Background
		// Set's content flips hasContentLoss from false to true). "BS" matches WebRCS's own on-screen naming
		// for Background Sets (confirmed live), same prefix formatSourceShort() already produces for NATIVE_n.
		for (const scr of this.instance.choices.getScreensArray()) {
			for (let setNum = 1; setNum <= 8; setNum += 1) {
				const bgPath = ['DEVICE', 'device', 'preconfig', 'backgrounds', 'screenList', 'items', scr.id, 'backgroundSetList', 'items', setNum.toString()]
				const backup = this.instance.state.get([...bgPath, 'backup'])
				if (!backup?.control?.pp?.enable) continue
				const slot1 = backup.slotList?.items?.['1']
				const slot2 = backup.slotList?.items?.['2']
				const hasContentLoss = this.instance.state.get([...bgPath, 'status', 'pp', 'hasContentLoss'])
				const primaryStatus = hasContentLoss ? 'INVALID' : 'VALID'
				const backup1Status = slotStatus(slot1?.control?.pp?.source, slot1?.status?.pp?.status)
				const backup2Status = slotStatus(slot2?.control?.pp?.source, slot2?.status?.pp?.status)
				const groupKey: string = backup.control.pp.group
				if (groupKey !== 'NONE') {
					(backupSlotStatusByGroup[groupKey] ??= []).push({ backup1: backup1Status, backup2: backup2Status, primary: primaryStatus })
					continue
				}
				setIndex += 1
				currentSetIndices.add(setIndex)
				const v = `backups.set${setIndex}`
				const primaryLabel = this.instance.state.get([...bgPath, 'pp', 'label'])
				for (const [suffix, name] of [
					['activeslot', 'Active Slot'], ['activesource', 'Active Source'], ['automode', 'Auto Mode'],
					['primary.source', 'Primary Source'], ['primary.status', 'Primary Status'],
					['backup1.source', 'Backup1 Source'], ['backup1.status', 'Backup1 Status'],
					['backup2.source', 'Backup2 Source'], ['backup2.status', 'Backup2 Status'],
				]) {
					this.instance.addVariable({ id: 'backupVariables', variableId: `${v}.${suffix}`, name: `Backup Set ${setIndex}: ${name}` })
				}
				this.instance.setVariableValues({
					[`${v}.activeslot`]: slotLabel(backup.status?.pp?.activeSlot),
					[`${v}.activesource`]: formatSourceShort(backup.status?.pp?.activeSource),
					[`${v}.automode`]: backup.control.pp.enableAutoSelect,
					[`${v}.primary.source`]: primaryLabel || `${scr.id} BS${setNum}`,
					[`${v}.primary.status`]: primaryStatus,
					[`${v}.backup1.source`]: formatSourceShort(slot1?.control?.pp?.source),
					[`${v}.backup1.status`]: backup1Status,
					[`${v}.backup2.source`]: formatSourceShort(slot2?.control?.pp?.source),
					[`${v}.backup2.status`]: backup2Status,
				})
			}
		}

		let groupIndex = 0
		for (let i = 1; i <= 64; i += 1) {
			const key = `GROUP_${i}`
			const group = this.instance.state.get(['DEVICE', 'device', 'backup', 'groupList', 'items', key])
			// status.pp.isEnabled reflects whether the group currently has member inputs assigned, i.e. is
			// "in use" (confirmed live: both configured test groups show isEnabled=true, all 62 untouched
			// groups show false) - unrelated to Auto Mode, which can independently be on or off.
			if (!group?.status?.pp?.isEnabled) continue
			groupIndex += 1
			currentGroupIndices.add(groupIndex)
			const v = `backups.group${groupIndex}`
			const members = backupSlotStatusByGroup[key] ?? []
			for (const [suffix, name] of [
				['activeslot', 'Active Slot'], ['label', 'Label'], ['automode', 'Auto Mode'],
				['allprimaries.status', 'Worst Primary Status'],
				['allbackup1.status', 'Worst Backup1 Status'], ['allbackup2.status', 'Worst Backup2 Status'],
			]) {
				this.instance.addVariable({ id: 'backupVariables', variableId: `${v}.${suffix}`, name: `Backup Group ${groupIndex}: ${name}` })
			}
			this.instance.setVariableValues({
				[`${v}.activeslot`]: slotLabel(group.status.pp.activeSlot),
				[`${v}.label`]: group.control?.pp?.label ?? '',
				[`${v}.automode`]: group.control?.pp?.enableAutoSelect ?? false,
				[`${v}.allprimaries.status`]: worstStatus(members.map((m) => m.primary)),
				[`${v}.allbackup1.status`]: worstStatus(members.map((m) => m.backup1)),
				[`${v}.allbackup2.status`]: worstStatus(members.map((m) => m.backup2)),
			})
		}

		// Sets/Groups that used to exist but no longer do (Backup disabled, or a Group emptied out) - deregister
		// only their own exact variables, never a blanket sweep.
		const setSuffixes = ['activeslot', 'activesource', 'automode', 'primary.source', 'primary.status', 'backup1.source', 'backup1.status', 'backup2.source', 'backup2.status']
		for (const idx of this.registeredBackupSetIndices) {
			if (currentSetIndices.has(idx)) continue
			for (const suffix of setSuffixes) this.instance.removeVariable('backupVariables', `backups.set${idx}.${suffix}`)
		}
		this.registeredBackupSetIndices = currentSetIndices

		const groupSuffixes = ['activeslot', 'label', 'automode', 'allprimaries.status', 'allbackup1.status', 'allbackup2.status']
		for (const idx of this.registeredBackupGroupIndices) {
			if (currentGroupIndices.has(idx)) continue
			for (const suffix of groupSuffixes) this.instance.removeVariable('backupVariables', `backups.group${idx}.${suffix}`)
		}
		this.registeredBackupGroupIndices = currentGroupIndices

		// The set of Backup Sets/Groups just above is exactly what "Backups - Set Backup Set to Source"/"Set
		// Auto Mode" offer as their "Backup Set / Group" dropdown choices (getBackupSetChoices()) - those
		// choices are only (re-)computed when action definitions are rebuilt, which only happens via
		// updateInstance(), not automatically just because state/variables changed. Without this, enabling a
		// new Backup Set or Group live-confirmed (2026-08-28) never appeared in the dropdown until some
		// unrelated change happened to trigger a republish. Safe to call unconditionally here since this whole
		// function is already debounced to at most once per second.
		void this.instance.updateInstance()
		return false
	}

	/** Anything under an input's Backup config/status changes - refreshes every backups.setX.* variable and
	 * the group-membership-driven appear/disappear behavior, see refreshBackupVariables. Debounced (see
	 * debounce()'s own comment) so a burst of related changes coalesces into a single rebuild. `fbk` is
	 * separate from `fun`'s debounce - it triggers an immediate check of the two Backup status feedbacks
	 * (Active Backup Source / Auto Mode Status) on the same xSelectSlot/enableAutoSelect fields, so pressing
	 * "Set Backup Set to Source"/"Set Auto Mode" reflects on a button right away instead of only updating
	 * whenever something else happens to trigger it. */
	get backupSetChange():Subscription {
		return {
			pat: 'device/inputList/items/IN_\\d+/backup',
			fbk: ['deviceBackupSetSourceStatus', 'deviceBackupAutoModeStatus'],
			fun: () => {
				this.debounce('backupVariables', 1000, this.refreshBackupVariables)
				return false
			},
		}
	}

	/** Anything under a Background Set's own Backup config/status changes - same purpose as backupSetChange
	 * above, for the completely separate Background Set backup structure (per-Screen, per-Background-Set-slot,
	 * live-confirmed 2026-08-28: DEVICE/device/preconfig/backgrounds/screenList/items/{screen}/
	 * backgroundSetList/items/{1-8}/backup). Kept as its own subscription rather than folding into
	 * backupSetChange's pattern since the path shapes are structurally unrelated (per-input list vs.
	 * per-screen-per-slot), but shares the same debounce key so a burst touching both kinds still coalesces
	 * into one rebuild. Also carries `fbk` for the same reason as backupSetChange - BGSET targets are one of
	 * the three kinds getBackupControlPath()/getBackupSetChoices() support. */
	get backupBackgroundSetChange():Subscription {
		return {
			pat: 'device/preconfig/backgrounds/screenList/items/\\w+/backgroundSetList/items/\\d+/backup',
			fbk: ['deviceBackupSetSourceStatus', 'deviceBackupAutoModeStatus'],
			fun: () => {
				this.debounce('backupVariables', 1000, this.refreshBackupVariables)
				return false
			},
		}
	}

	/** A backup-enabled input's live signal presence changes (cable connected/disconnected, format changes) -
	 * refreshes backups.setX.primary.status / backups.groupX.allprimaries.status, see refreshBackupVariables.
	 * The `pat` itself still matches signal changes on ANY input (regex can't express "is this input relevant
	 * to Backup"), but `fun` gates the actual (expensive) rebuild behind isInputRelevantToBackup() first - a
	 * routine signal change on an input with nothing to do with Backup (laptop sleeping, camera power-cycle,
	 * cable swap) would otherwise trigger a full rebuild every time, live-confirmed to happen far more often
	 * in practice than "only during an actual backup failover". Debounced like backupSetChange above. */
	get backupPrimarySignalChange():Subscription {
		return {
			pat: 'device/inputList/items/IN_\\d+/plugList/items/\\w+/status/signal/pp/isValid',
			fun: (path) => {
				if (!path || typeof path !== 'string') return false
				const match = path.match(/inputList\/items\/(IN_\d+)\/plugList/)
				if (!match || !this.isInputRelevantToBackup(match[1])) return false
				this.debounce('backupVariables', 1000, this.refreshBackupVariables)
				return false
			},
		}
	}

	/** Anything under a Backup Group's config/status changes - refreshes every backups.groupX.* variable, see
	 * refreshBackupVariables. Debounced like backupSetChange above. Also carries `fbk`, same reason as
	 * backupSetChange - GROUP targets are one of the three kinds getBackupControlPath() supports. */
	get backupGroupChange():Subscription {
		return {
			pat: 'device/backup/groupList/items/GROUP_\\d+',
			fbk: ['deviceBackupSetSourceStatus', 'deviceBackupAutoModeStatus'],
			fun: () => {
				this.debounce('backupVariables', 1000, this.refreshBackupVariables)
				return false
			},
		}
	}

	/** The selected preset (program or preview) changes */
	get selectedPreset():Subscription {
		return {
			pat: '/live/screens/presetModeSelection/presetMode',
			fbk: ['livePresetSelection', 'remoteLayerSelection'],
			fun: (path, _value) => {
				if (this.instance.state.syncSelection) {
					this.instance.setVariableValues({
						selectedPreset: this.instance.state.get(path) === 'PREVIEW' ? 'PVW' : 'PGM'
					})
				}
				return false
			},
		}
	}

	/** Freeze status of an input changes */
	get inputFreeze():Subscription {
		return {
			pat: 'device/inputList/items/(\\w+?)/control/pp/freeze',
			fbk: 'deviceInputFreeze',
		}
	}

	/** Timer state changes */
	get timerState():Subscription {
		return {
			pat: 'DEVICE/device/timerList/items/TIMER_(\\d)/status/pp/state',
			fbk: 'timerState',
			ini: Array.from( {length: this.constants.maxTimers}, (_, i) => (i + 1).toString() ),
			fun: (path, _value) => {
				if (!path) return false
				const timer = path.toString().match(/(?<=TIMER_)(\d)\//) || ['0', '0']
				const varId = this.varName(`timer${timer[1]}_status`, `TIMER${timer[1]}.status`)
				this.instance.addVariable({ id: 'timerState', variableId: varId, name: `Status of Timer ${timer[1]}` })
				this.instance.setVariableValues({[varId]:  this.instance.state.get(path)})
				return false
			},
		}
	}

	/** Screen memory gets renamed */
	get screenMemoryLabel():Subscription {
		return {
			pat: 'DEVICE/device/presetBank/bankList/items/(\\d{1,4})/control/pp/label',
			ini: Array.from({ length: this.constants.maxScreenMemories }, (_, i) => (i + 1).toString()),
			fun: (path, _value) => {
				if (!path) return false
				const memory = Array.isArray(path) ? path[5] : path.split('/')[5]
				const label = memory.toString() !== '0' ? this.instance.state.get(path) : ''
				const screens = this.instance.choices.getChosenScreenAuxes('all')

				const varId = this.varName(`screenMemory${memory}label`, `SM${memory}.label`)
				if (this.instance.state.get(path.toString().replace('control/pp/label', 'status/pp/isValid'))) {
					this.instance.addVariable({ id: 'screenMemoryLabel', variableId: varId, name: `Label of Screen Memory ${memory}` })
				}
				this.instance.setVariableValues({[varId]:  label})

				for (const screen of screens) {
					const pgmmem = this.instance.state.get([
						'DEVICE',
						'device',
						'screenList', 'items', screen,
						'presetList', 'items', this.instance.state.get('LOCAL/screens/' + screen + '/pgm/preset'),
						'presetId','status','pp','id'
					])
					if (memory == pgmmem) {
						const pgmVarId = this.varName(`screen${screen}memoryLabelPGM`, `${screen}.pgm.memory.label`)
						this.instance.addVariable({ id: 'screenMemoryLabel', variableId: pgmVarId, name: `Label of memory in Program for ${screen}` })
						this.instance.setVariableValues({[pgmVarId]:  label})
					}
					const pvwmem = this.instance.state.get([
						'DEVICE',
						'device',
						'screenList', 'items', screen,
						'presetList', 'items', this.instance.state.get('LOCAL/screens/' + screen + '/pvw/preset'),
						'presetId','status','pp','id'
					])
					if (memory == pvwmem) {
						const pvwVarId = this.varName(`screen${screen}memoryLabelPVW`, `${screen}.prw.memory.label`)
						this.instance.addVariable({ id: 'screenMemoryLabel', variableId: pvwVarId, name: `Label of memory in Preview for ${screen}` })
						this.instance.setVariableValues({[pvwVarId]:  label})
					}
				}
				return true
			},
		}
	}

	/** Last used master memory changes */
	get masterMemory():Subscription {
		return {
			pat: 'DEVICE/device/masterPresetBank/status/lastUsed/presetModeList/items/(PROGRAM|PREVIEW)/pp/memoryId',
			ini: ['PROGRAM', 'PREVIEW'],
			fbk: 'deviceMasterMemory',
		}
	}

	/** Master memory gets renamed */
	get masterMemoryLabel():Subscription {
		return {
			pat: 'DEVICE/device/masterPresetBank/bankList/items/(\\d+)/control/pp/label',
			ini: Array.from({ length: this.constants.maxMasterMemories }, (_, i) => (i + 1).toString()),
			fun: (path, _value) => {
				if (!path) return false
				const memory = Array.isArray(path) ? path[5] : path.split('/')[5]
				const varId = this.varName(`masterMemory${memory}label`, `MM${memory}.label`)
				if (this.instance.state.get(path.toString().replace('control/pp/label', 'status/pp/isValid'))) {
					this.instance.addVariable({ id: 'masterMemoryLabel', variableId: varId, name: `Label of Master Memory ${memory}` })
				}
				this.instance.setVariableValues({[varId]:  this.instance.state.get(path)})
				return true
			},
		}
	}

	/** Multiviewer memory gets renamed */
	get multiviewerMemoryLabel():Subscription {
		return {
			pat: 'DEVICE/device/monitoringBank/bankList/items/(\\d+)/control/pp/label',
			ini: Array.from({ length: this.constants.maxMultiviewerMemories }, (_, i) => (i + 1).toString()),
			fun: (path, _value) => {
				if (!path) return false
				const memory = Array.isArray(path) ? path[5] : path.split('/')[5]
				const varId = this.varName(`multiviewerMemory${memory}label`, `MV${memory}.label`)
				if (this.instance.state.get(path.toString().replace('control/pp/label', 'status/pp/isValid'))) {
					this.instance.addVariable({ id: 'multiviewerMemoryLabel', variableId: varId, name: `Label of Multiviewer Memory ${memory}` })
				}
				this.instance.setVariableValues({[varId]:  this.instance.state.get(path)})
				return true
			},
		}
	}

	/** Layer memory gets renamed */
	get layerMemoryLabel():Subscription {
		return {
			pat: 'DEVICE/device/layerBank/bankList/items/(\\d+)/control/pp/label',
			ini: Array.from({ length: 50 }, (_, i) => (i + 1).toString()),
			fun: (path, _value) => {
				if (!path) return false
				const memory = Array.isArray(path) ? path[5] : path.split('/')[5]
				const varId = this.varName(`layerMemory${memory}label`, `LM${memory}.label`)
				if (this.instance.state.get(path.toString().replace('control/pp/label', 'status/pp/isValid'))) {
					this.instance.addVariable({ id: 'layerMemoryLabel', variableId: varId, name: `Label of Layer Memory ${memory}` })
				}
				this.instance.setVariableValues({[varId]:  this.instance.state.get(path)})
				return true
			},
		}
	}

	/** Still gets renamed */
	get stillLabel():Subscription {
		return {
			pat: 'DEVICE/device/stillList/items/(\\d+)/control/pp/label',
			ini: Array.from({ length: this.constants.maxStills }, (_, i) => (i + 1).toString()),
			fun: (path, _value) => {
				if (!path) return false
				const input = Array.isArray(path) ? path[4] : path.split('/')[4]
				// New-name side renamed STILL{n}.label -> IMG{n}.label per explicit user request, to match this
				// module's own "Image Store"/"Image Library" terminology established today (formatSourceShort's
				// IMGn convention) - the old-name side (useOldVariableNames) is untouched on purpose.
				const varId = this.varName(`STILL_${input}label`, `IMG${input}.label`)
				if (this.instance.state.get(path.toString().replace('control/pp/label', 'status/pp/isValid'))) {
					this.instance.addVariable({ id: 'stillLabel', variableId: varId, name: `Label of Image ${input}` })
				}
				this.instance.setVariableValues({[varId]:  this.instance.state.get(path)})
				return true
			},
		}
	}

	/** A still slot gets filled with an image or cleared */
	get stillValid():Subscription {
		return {
			pat: 'DEVICE/device/stillList/items/(\\d+)/status/pp/isValid',
			fun: (_path?: string | string[], _value?: string | string[] | number | boolean): boolean => {
				return true
			},
		}
	}

	/** An image in the Image Library gets added, replaced or removed - triggers a rebuild of the "assign image" action's choices */
	get stillLibraryChange():Subscription {
		return {
			pat: `${this.constants.stillLibraryPath}/items/(\\d+)/status/pp/isValid`,
			fun: (_path?: string | string[], _value?: string | string[] | number | boolean): boolean => {
				return true
			},
		}
	}

	/** Screen gets renamed */
	get screenLabel():Subscription {
		return {
			pat: 'DEVICE/device/screenList/items/S(\\d{1,2})/control/pp/label',
			ini: Array.from({ length: this.constants.maxScreens }, (_, i) => (i + 1).toString()),
			fun: (path, _value) => {
				if (!path) return false
				const input = Array.isArray(path) ? path[4] : path.split('/')[4]
				const label = this.instance.state.get(path)
				const exists = this.instance.state.get(path.toString().replace('control/pp/label', 'status/pp/mode')) !== 'DISABLED'
				if (this.instance.config.useOldVariableNames) {
					if (exists) {
						this.instance.addVariable({ id: 'screenLabel', variableId: `${input.replace('S', 'SCREEN_')}label`, name: `Label of Screen ${input}` })
						this.instance.addVariable({ id: 'screenLabel', variableId: `screen${input}label`, name: `Label of Screen ${input}` })
					}
					this.instance.setVariableValues({[input.replace('S', 'SCREEN_') + 'label']: label})
					this.instance.setVariableValues({['screen' + input + 'label']: label})
				} else {
					if (exists) {
						this.instance.addVariable({ id: 'screenLabel', variableId: `${input}.label`, name: `Label of Screen ${input}` })
					}
					this.instance.setVariableValues({[`${input}.label`]: label})
				}
				return true
			},
		}
	}

	/** Auxscreen gets renamed */
	get auxscreenLabel():Subscription {
		return {
			pat: 'DEVICE/device/screenList/items/A(\\d{1,2})/control/pp/label',
			ini: Array.from({ length: this.constants.maxAuxScreens }, (_, i) => (i + 1).toString()),
			fun: (path, _value) => {
				if (!path) return false
				const input = Array.isArray(path) ? path[4] : path.split('/')[4]
				const label = this.instance.state.get(path)
				const exists = this.instance.state.get(path.toString().replace('control/pp/label', 'status/pp/mode')) !== 'DISABLED'
				if (this.instance.config.useOldVariableNames) {
					if (exists) {
						this.instance.addVariable({ id: 'auxscreenLabel', variableId: `${input.replace('A', 'AUXSCREEN_')}label`, name: `Label of Auxscreen ${input}` })
						this.instance.addVariable({ id: 'auxscreenLabel', variableId: `screen${input}label`, name: `Label of Auxscreen ${input}` })
					}
					this.instance.setVariableValues({[input.replace('A', 'AUXSCREEN_') + 'label']: label})
					this.instance.setVariableValues({['screen' + input + 'label']: label})
				} else {
					if (exists) {
						this.instance.addVariable({ id: 'auxscreenLabel', variableId: `${input}.label`, name: `Label of Auxscreen ${input}` })
					}
					this.instance.setVariableValues({[`${input}.label`]: label})
				}
				return true
			},
		}
	}

	/** Screen gets enabled or disabled */
	get screenEnabled():Subscription {
		return {
			pat: 'device/(?:screen|auxiliaryScreen|auxiliary)List/items/([AS]?\\d{1,3})/status/pp/mode',
			fun: (_path?: string | string[], _value?: string | string[] | number | boolean): boolean => {
				return true
			},
		}
	}

	/** Input gets enabled or disabled */
	get liveInputsChange():Subscription {
		return {
			pat: 'DEVICE/device/inputList/items/IN_(\\d{1,2})/status/pp/isEnabled',
			fun: (_path?: string | string[], _value?: string | string[] | number | boolean): boolean => {
				return true
			},
		}
	}

	/** A master memory gets added or removed */
	get masterMemoriesChange():Subscription {
		return {
			pat: 'DEVICE/device/masterPresetBank/bankList/items/(\\d{1,3})/status/pp/isValid',
			fun: (_path?: string | string[], _value?: string | string[] | number | boolean): boolean => {
				return true
			},
		}
	}

	/** A screen memory gets added or removed */
	get screenMemoriesChange():Subscription {
		return {
			pat: 'DEVICE/device/presetBank/bankList/items/(\\d{1,4})/status/pp/isValid',
			fbk: 'deviceScreenMemorySlotStatus',
			fun: (_path?: string | string[], _value?: string | string[] | number | boolean): boolean => {
				return true
			},
		}
	}

	/** A layer memory gets added or removed */
	get layerMemoriesChange():Subscription {
		return {
			pat: 'DEVICE/device/layerBank/bankList/items/(\\d{1,3})/status/pp/isValid',
			fun: (_path?: string | string[], _value?: string | string[] | number | boolean): boolean => {
				return true
			},
		}
	}

	/** A multiviewer memory gets added or removed */
	get multiviewerMemoriesChange():Subscription {
		return {
			pat: 'DEVICE/device/monitoringBank/bankList/items/(\\d{1,3})/status/pp/isValid',
			fun: (_path?: string | string[], _value?: string | string[] | number | boolean): boolean => {
				return true
			},
		}
	}

	/** A layer gets added or removed */
	get layerCountChange():Subscription {
		return {
			pat: 'DEVICE/device/screenList/items/((?:S|A)\\d{1,2})/status/pp/layerCount',
			fun: (_path?: string | string[], _value?: string | string[] | number | boolean): boolean => {
				return true
			},
		}
	}

	/** The color of a memory gets changed */
	get memoryColorChange():Subscription {
		return {
			pat: 'banks/(\\w+)/items/(\\d+)/color',
			fun: (_path?: string | string[], _value?: string | string[] | number | boolean): boolean => {
				return true
			},
		}
	}

	/**
	 * The label of an input gets changed. Registered based on isAvailable alone - NOT getLiveInputArray(),
	 * which also factors in isEnabled (WebRCS's "hide from source picker" preconfig visibility toggle).
	 * Live-confirmed bug: an input hidden this way (isAvailable=true, isEnabled=false) never got a IN{n}.label
	 * variable at all (e.g. IN1 missing while IN2 existed, on a device where IN1 was preconfig-hidden) -
	 * exactly the case [[feedback_preconfig_visibility_not_existence]] warns about. getLiveInputArray() is
	 * correctly scoped for building a source-picker dropdown, just not for gating this module's own state.
	 */
	get inputLabel():Subscription {
		return {
			pat: 'DEVICE/device/inputList/items/IN_(\\d+)/control/pp/label',
			ini: Array.from({ length: this.constants.maxInputs }, (_, i) => (i + 1).toString()),
			fun: (path, _value) => {
				if (!path) return false;
				const input = Array.isArray(path) ? path[4] : path.split('/')[4];
				const num = input.replace(/^\w+_/, '')
				const varId = this.varName(`INPUT_${num}label`, `IN${num}.label`)
				if (this.instance.state.get(path.toString().replace('control/pp/label', 'status/pp/isAvailable'))) {
					this.instance.addVariable({ id: 'inputLabel', variableId: varId, name: `Label of Input ${input}` })
				}
				this.instance.setVariableValues({ [varId]: this.instance.state.get(path) });
				return true;
			},
		}
	}

	/**
	 * An input's live signal status - VALID/INVALID, same vocabulary and same underlying check as
	 * getInputSignalStatus() (already used for the Backup feature's primary.status). Replaces an earlier
	 * IN{n}.active (based on status.pp.global !== 'DISABLE') per explicit user decision: the only
	 * administrative toggle a user has on an input is WebRCS's "invisible in source picker" preconfig
	 * setting, which must never affect this module's own reporting (see
	 * [[feedback_preconfig_visibility_not_existence]]) - so there is no meaningful separate "enabled/disabled"
	 * concept left to report for an input beyond whether it exists (the variable's own existence already
	 * answers that) and whether it currently has a valid signal (this variable's value).
	 * Registers IN{n}.status only for inputs where isAvailable is true (i.e. actually licensed/installed on
	 * this specific hardware) - NOT unconditionally for all maxInputs=256 theoretical slots, same reasoning as
	 * outputStatus/outputPlugStatus/getLiveInputArray() (see [[project_variable_naming_conventions]]'s
	 * registration-scope rule - this is exactly the axis that caused the 1486-variable spike when done wrong).
	 */
	get inputStatus():Subscription {
		const availablePath = (num: string) => `DEVICE/device/inputList/items/IN_${num}/status/pp/isAvailable`

		return {
			pat: 'device/inputList/items/IN_(\\d+)/plugList/items/\\w+/status/signal/pp/isValid',
			fbk: 'deviceInputSignalStatus',
			ini: () => {
				this.instance.removeVariable('inputStatus')
				for (let i = 1; i <= this.constants.maxInputs; i += 1) {
					if (!this.instance.state.get(availablePath(i.toString()))) continue
					this.instance.addVariable({ id: 'inputStatus', variableId: `IN${i}.status`, name: `Signal status of Input ${i}` })
					this.instance.setVariableValues({ [`IN${i}.status`]: this.getInputSignalStatus(`IN_${i}`) })
				}
				return []
			},
			fun: (path) => {
				if (!path || typeof path !== 'string') return false
				const match = path.match(/inputList\/items\/IN_(\d+)\/plugList\/items\/\w+\/status\/signal\/pp\/isValid/)
				if (!match) return false
				if (!this.instance.state.get(availablePath(match[1]))) return false
				this.instance.setVariableValues({ [`IN${match[1]}.status`]: this.getInputSignalStatus(`IN_${match[1]}`) })
				return false
			},
		}
	}

	/** The screen/aux ids that currently have registered screenSize variables - lets refreshScreenSize add/
	 * remove only the exact screens whose existence actually changed, same surgical reasoning as
	 * lastLayerCountByScreen/refreshLayerVariables above. */
	private registeredScreenSizeIds: Set<string> = new Set()

	/**
	 * A screen or auxscreen's canvas resolution or enabled-state changes. Registers S{n}.width/height/
	 * aspectratio and A{n}.width/height/aspectratio (used to build V3 position/size expressions) ONLY for
	 * currently-enabled screens/auxes, and keeps them live. aspectratio is computed as width/height rounded
	 * to 3 decimals (there is no raw device field for it at this level at all) - same approach as
	 * OUT{n}.aspectratio/MVW{n}.aspectratio, per explicit user request ("Die Anzeige NATIVE sagt niemandem
	 * etwas").
	 * No `.active` variable - per explicit user decision (mirroring IN{n}.active -> IN{n}.status and the
	 * S{n}.layer{x}.active removal): a disabled screen's variables don't exist at all, rather than existing
	 * with a value of `false` - "Wenn nicht aktiv, dann soll S? gar nicht existieren." Disabling a screen
	 * removes its .width/.height/.aspectratio entirely; re-enabling it re-adds them.
	 */
	private refreshScreenSize = (): boolean => {
		const pathForProp = (isAux: boolean, platformId: string, prop: 'sizeH' | 'sizeV') => [
			'DEVICE',
			...(isAux ? this.constants.auxPath : this.constants.screenPath),
			'items', platformId,
			...this.constants.screenSizePath,
			prop,
		].join('/')

		const currentIds = new Set<string>()
		for (const scr of [...this.instance.choices.getScreensArray(), ...this.instance.choices.getAuxArray()]) {
			const info = this.instance.choices.getScreenInfo(scr.id)
			currentIds.add(info.id)
			if (!this.registeredScreenSizeIds.has(info.id)) {
				const kind = info.isAux ? 'Auxscreen' : 'Screen'
				this.instance.addVariable({ id: 'screenSize', variableId: `${info.id}.width`, name: `Width of ${kind} ${info.id}` })
				this.instance.addVariable({ id: 'screenSize', variableId: `${info.id}.height`, name: `Height of ${kind} ${info.id}` })
				this.instance.addVariable({ id: 'screenSize', variableId: `${info.id}.aspectratio`, name: `aspectratio of ${kind} ${info.id}` })
			}
			const w = this.instance.state.get(pathForProp(info.isAux, info.platformId, 'sizeH'))
			const h = this.instance.state.get(pathForProp(info.isAux, info.platformId, 'sizeV'))
			this.instance.setVariableValues({
				[`${info.id}.width`]: w ?? '',
				[`${info.id}.height`]: h ?? '',
				[`${info.id}.aspectratio`]: w && h ? Math.round((w / h) * 1000) / 1000 : '',
			})
		}

		for (const id of this.registeredScreenSizeIds) {
			if (currentIds.has(id)) continue
			this.instance.removeVariable('screenSize', `${id}.width`)
			this.instance.removeVariable('screenSize', `${id}.height`)
			this.instance.removeVariable('screenSize', `${id}.aspectratio`)
		}
		this.registeredScreenSizeIds = currentIds

		return false
	}

	get screenSize():Subscription {
		return {
			pat: `(?:${this.constants.screenSizePath.join('/')}/size(?:H|V)|status/pp/mode)`,
			ini: () => {
				this.refreshScreenSize()
				return []
			},
			fun: () => {
				this.refreshScreenSize()
				return false
			},
		}
	}

	/**
	 * Full live rebuild of every S{n}/A{n}.layer{x}.* variable: .source/.width/.height/.status/.x/.y, registered
	 * ONLY for layers that actually exist right now (1..this screen's own live layerCount) - NOT every
	 * theoretical slot up to getMaxConfiguredLayerCount() like an earlier .active version did. Per explicit
	 * user decision (mirroring the same one made for IN{n}.active -> IN{n}.status): the variable's own
	 * existence already proves the layer exists, so a separate .active field was redundant - dropped
	 * entirely in favor of .status (VALID/INVALID, see getLayerSourceStatus()). Also registers .layerbg.source
	 * for the background/NATIVE layer (no .status/.width/.height for it - not requested). Re-runs completely
	 * on any relevant change (layer count, or any layer's source/position, or presetUp, or any input's live
	 * signal) rather than diffing - same reasoning as refreshBackupVariables: the SET of variables itself has
	 * to grow/shrink live as layers are added/removed, which can happen anytime during live operation.
	 * Reads the PROGRAM (on-air) side of each screen directly off screenGroupPath's own presetUp field (NOT
	 * choices.getPreset(id, 'PGM'), which goes through LOCAL/screens/{screen}/pgm/preset - live-confirmed
	 * broken: that LOCAL value is only ever written by screenPreset's AT_UP/AT_DOWN transition handler and is
	 * never seeded from the device's actual current state, so on a screen with no live Take/Cut since
	 * Companion connected it stays stale/undefined forever, even though presetUp itself is always correct -
	 * this is what caused the reported "layer size never updates" bug, see [[project_feature_requests]]).
	 * Uses screenGroupPath for both screens and auxes (same simplification screenPreset/deviceTbar/
	 * deviceTakeTime already use, not auxGroupPath) - a known latent gap on platforms where the two differ
	 * (LP/Midra), harmless on LP4 where they're identical; not fixed here, already tracked separately.
	 * Deliberately not tied to whichever preset a Companion user has toggled as "selected" (unlike
	 * SelectedLayer.*), since this is meant as an always-on "what's actually on air" monitoring view, not an
	 * editing-target reference.
	 * Only scoped to currently non-disabled screens/auxes (getScreensArray()/getAuxArray() without
	 * getAlsoDisabled) - deliberately NOT every theoretical screen slot like inputActive/outputUsedIn above,
	 * to keep the variable count proportional to what's actually configured (a real installation's screen
	 * count is usually small, unlike the fixed 256/96 input/output slot arrays) - see the performance note
	 * below for the full reasoning. A screen enabled after connect won't get layer variables until some other
	 * layer-content or layerCount change happens to trigger a rebuild - same known limitation flagged for
	 * screenSize/outputStatus/etc. in [[project_feature_requests]], not fixed here.
	 */
	/** The last-seen layerCount per screen/aux id - lets refreshLayerVariables register/deregister only the
	 * exact layer numbers that actually appeared or disappeared, instead of any blanket remove-everything-
	 * and-rebuild step. Live-confirmed this precision matters: moving a single layer was needlessly tearing
	 * down and rebuilding ~165 unrelated variables across every other screen/layer, and even a per-screen
	 * (rather than per-layer) rebuild would still spuriously touch OTHER layers on the SAME screen whose
	 * variables never actually changed - a spurious remove+re-add of a variable that Companion Expressions/
	 * Triggers are watching can look like two change events (briefly undefined, then the "new" value) instead
	 * of none, which could misfire a trigger's "variable changed" condition even though nothing really did. */
	private lastLayerCountByScreen: Map<string, number> = new Map()

	private refreshLayerVariables = (): boolean => {
		const layerVariableSuffixes = ['source', 'status', 'width', 'height', 'x', 'y']
		const screens = [...this.instance.choices.getScreensArray(), ...this.instance.choices.getAuxArray()]
		// A layer source of "NONE" (empty slot) is flattened to "" rather than the literal word, per explicit
		// user request for the background layer - applied to numbered layers too for consistency.
		const sourceValue = (raw: string | undefined): string => (raw && raw !== 'NONE' ? this.formatSourceShort(raw) : '')
		// A layer's own signal status - VALID/INVALID, same vocabulary as IN{n}.status. A live input source
		// delegates straight to getInputSignalStatus() (its own physical signal presence); Still/Color/Timer/
		// Screen-reinsertion sources are always-available generated/static content with no signal-loss
		// concept, so they read VALID; an unassigned ("NONE") layer reads INVALID - "kein Signal liegt an".
		// Live-confirmed bug: a layer's own source.pp.inputNum uses "LIVE_n" for a live input when assigned
		// via WebRCS drag&drop (matching the Backup subsystem's own convention), NOT "IN_n" as assumed -
		// getInputSignalStatus()/inputList are keyed by "IN_n", so the id has to be normalized first.
		const layerSourceStatus = (raw: string | undefined): string => {
			if (!raw || raw === 'NONE') return 'INVALID'
			const liveMatch = raw.match(/^(?:LIVE|IN)_(\d+)$/)
			if (liveMatch) return this.getInputSignalStatus(`IN_${liveMatch[1]}`)
			return 'VALID'
		}

		const seenScreenIds = new Set<string>()

		for (const scr of screens) {
			const info = this.instance.choices.getScreenInfo(scr.id)
			seenScreenIds.add(info.id)
			const screenListPath = info.isAux ? this.constants.auxPath : this.constants.screenPath
			const layerCount: number = this.instance.state.get(['DEVICE', ...screenListPath, 'items', info.platformId, 'status', 'pp', 'layerCount']) ?? 0
			const previousLayerCount = this.lastLayerCountByScreen.get(info.id) ?? 0
			const presetKey = this.instance.state.get(['DEVICE', ...this.constants.screenGroupPath, 'items', info.id, 'control', 'pp', 'presetUp'])
			const presetPath = [...screenListPath, 'items', info.platformId, 'presetList', 'items', presetKey]

			// Layers that used to exist but no longer do - deregister only their own exact variables.
			for (let i = layerCount + 1; i <= previousLayerCount; i += 1) {
				for (const suffix of layerVariableSuffixes) {
					this.instance.removeVariable('layerVariables', `${info.id}.layer${i}.${suffix}`)
				}
			}
			if (layerCount !== previousLayerCount) this.lastLayerCountByScreen.set(info.id, layerCount)

			for (let i = 1; i <= layerCount; i += 1) {
				const layerPath = [...presetPath, ...this.instance.choices.getLayerPath(i)]
				const source = this.instance.state.get(['DEVICE', ...layerPath, 'source', 'pp', 'inputNum'])
				const sizeH = this.instance.state.get(['DEVICE', ...layerPath, 'position', 'pp', 'sizeH'])
				const sizeV = this.instance.state.get(['DEVICE', ...layerPath, 'position', 'pp', 'sizeV'])
				const posH = this.instance.state.get(['DEVICE', ...layerPath, 'position', 'pp', 'posH']) ?? 0
				const posV = this.instance.state.get(['DEVICE', ...layerPath, 'position', 'pp', 'posV']) ?? 0
				// Same anchor conversion as SelectedLayer.x/.y (refreshSelectedLayerRect above) - the device
				// always stores posH/posV relative to CENTER; converting into whatever the global anchor point
				// is currently set to matches what WebRCS's own Position & Size panel is showing right now, and
				// what "Set Position & Size"'s own default Anchor ("sel") will interpret the same number as.
				const anchor = this.instance.choices.getGlobalAnchorPoint()
				const anchorPos = typeof sizeH === 'number' && typeof sizeV === 'number'
					? (anchor === 'CENTER' ? { x: posH, y: posV } : this.instance.choices.convertAnchorPosition(posH, posV, sizeH, sizeV, 'CENTER', anchor))
					: { x: '', y: '' }
				// Only a genuinely NEW layer number (beyond what existed last time) needs registering - an
				// existing layer's variables already exist and only need their values updated.
				if (i > previousLayerCount) {
					this.instance.addVariable({ id: 'layerVariables', variableId: `${info.id}.layer${i}.source`, name: `Source of Layer ${i} on ${info.id}` })
					this.instance.addVariable({ id: 'layerVariables', variableId: `${info.id}.layer${i}.status`, name: `Signal status of Layer ${i} on ${info.id}` })
					this.instance.addVariable({ id: 'layerVariables', variableId: `${info.id}.layer${i}.width`, name: `Width of Layer ${i} on ${info.id}` })
					this.instance.addVariable({ id: 'layerVariables', variableId: `${info.id}.layer${i}.height`, name: `Height of Layer ${i} on ${info.id}` })
					this.instance.addVariable({ id: 'layerVariables', variableId: `${info.id}.layer${i}.x`, name: `X position of Layer ${i} on ${info.id}` })
					this.instance.addVariable({ id: 'layerVariables', variableId: `${info.id}.layer${i}.y`, name: `Y position of Layer ${i} on ${info.id}` })
				}
				this.instance.setVariableValues({
					[`${info.id}.layer${i}.source`]: sourceValue(source),
					[`${info.id}.layer${i}.status`]: layerSourceStatus(source),
					[`${info.id}.layer${i}.width`]: typeof sizeH === 'number' ? sizeH : '',
					[`${info.id}.layer${i}.height`]: typeof sizeV === 'number' ? sizeV : '',
					[`${info.id}.layer${i}.x`]: anchorPos.x,
					[`${info.id}.layer${i}.y`]: anchorPos.y,
				})
			}

			// .layerbg.source always exists per screen - addVariable's own dedup makes calling it every time
			// a cheap no-op once registered, no need for its own new/existing distinction.
			const bgPath = [...presetPath, ...this.instance.choices.getLayerPath('NATIVE')]
			const bgSource = this.instance.state.get(['DEVICE', ...bgPath, 'source', 'pp', 'inputNum'])
			this.instance.addVariable({ id: 'layerVariables', variableId: `${info.id}.layerbg.source`, name: `Source of Background Layer on ${info.id}` })
			this.instance.setVariableValues({ [`${info.id}.layerbg.source`]: sourceValue(bgSource) })
		}

		// A screen that disappeared entirely (disabled) since last time - clean up its now-orphaned variables
		// rather than leaving them registered with a permanently stale value.
		for (const [screenId, previousLayerCount] of this.lastLayerCountByScreen) {
			if (seenScreenIds.has(screenId)) continue
			for (let i = 1; i <= previousLayerCount; i += 1) {
				for (const suffix of layerVariableSuffixes) {
					this.instance.removeVariable('layerVariables', `${screenId}.layer${i}.${suffix}`)
				}
			}
			this.instance.removeVariable('layerVariables', `${screenId}.layerbg.source`)
			this.lastLayerCountByScreen.delete(screenId)
		}

		return false
	}

	/**
	 * Triggers refreshLayerVariables on: a screen's layerCount changing (layer added/removed), any layer's
	 * source or position/size changing (for any preset A/B/C of any screen/aux - built from getLayerPath()'s
	 * own platform-abstracted segments, LP4/LP: "layerList", Midra: "liveLayerList"/"background" for bkg,
	 * rather than hardcoding path segment names, so this adapts automatically per platform the same way
	 * getLayerPath() itself already does), presetUp changing (a Take/Cut swapping which preset is PROGRAM -
	 * without this, a bare Take with no individual layer property touched would leave these variables showing
	 * the previous preset's now-stale content until some other coincidental layer edit happened to trigger a
	 * rebuild), or any input's live signal changing (needed for .layer{x}.status - we don't know in advance
	 * which layer(s), if any, currently show that input, so any input's signal flipping has to trigger a full
	 * re-check across all layers), or the global anchor point changing (needed for .layer{x}.x/.y - the same
	 * anchor conversion SelectedLayer.x/.y uses, see refreshLayerVariables' own comment - a pure anchor toggle
	 * with no position/size touched still changes what these values mean and must recompute them).
	 * Also reacts to a screen's own status.pp.mode changing (enabled <-> disabled) - without this, disabling
	 * or re-enabling a screen wouldn't itself trigger anything, leaving its layer variables stuck registered
	 * with stale values (disabled) or missing entirely (re-enabled) until some unrelated screen's layer
	 * change happened to coincidentally trigger a refresh. refreshLayerVariables' own screens/auxes loop
	 * already recomputes from getScreensArray()/getAuxArray() fresh every call and diffs against
	 * lastLayerCountByScreen, so it correctly registers/deregisters the affected screen's layers either way -
	 * this branch just makes sure that happens promptly on the actual enable/disable event, not by accident.
	 * Performance note (explicitly requested check): variable count is bounded on BOTH axes - screens/auxes
	 * to only the currently non-disabled ones (not this platform's theoretical 24+96), and layers to each
	 * screen's own live layerCount only (not this platform's theoretical maxLayers=128 per screen, and not
	 * every theoretical slot the way an earlier .active version did - see refreshLayerVariables' own comment).
	 * A real installation's screen and layer counts are small compared to those theoretical maximums, so total
	 * variable count stays proportional to what's actually configured, not the platform's worst case (which
	 * would be tens of thousands).
	 */
	get layerVariables():Subscription {
		const screenOrAux = `(?:${this.constants.screenPath.join('/')}|${this.constants.auxPath.join('/')})/items/\\w+`
		const numberedLayerSegment = this.instance.choices.getLayerPath('1')[0]
		const bgSegments = this.instance.choices.getLayerPath('NATIVE').join('/')
		const presetUpPat = `${this.constants.screenGroupPath.join('/')}/items/\\w+/control/pp/presetUp`
		const inputSignalPat = 'device/inputList/items/IN_\\d+/plugList/items/\\w+/status/signal/pp/isValid'
		const anchorPat = 'live/screens/layers/anchorPoint'

		return {
			pat: `(?:${screenOrAux}/(?:status/pp/(?:layerCount|mode)|presetList/items/\\w+/(?:${numberedLayerSegment}/items/\\d+/(?:source/pp/inputNum|position/pp/(?:posH|posV|sizeH|sizeV))|${bgSegments}/source/pp/inputNum))|${presetUpPat}|${inputSignalPat}|${anchorPat})`,
			ini: () => {
				this.refreshLayerVariables()
				return []
			},
			// Only the input-signal branch needs the (cheap) relevance pre-check - every other branch (layer
			// count, a layer's own source/position, presetUp, the global anchor) is already inherently
			// layer-relevant by construction, so those always refresh unconditionally.
			// Debounced (see debounce()'s own comment) - explicitly not meant to drive a smooth live animation
			// of a dragged layer, only to keep the variables' end-state correct for config-building, so a
			// generous 1000ms coalescing window is fine per explicit user direction.
			fun: (path) => {
				if (typeof path === 'string') {
					const match = path.match(/inputList\/items\/(IN_\d+)\/plugList/)
					if (match && !this.isInputShownOnAnyLayer(match[1])) return false
				}
				this.debounce('layerVariables', 1000, this.refreshLayerVariables)
				return false
			},
		}
	}

	/**
	 * A physical output's resolution, refresh rate, or format changes. Registers out{n}.width/height/refreshrate/
	 * format/formatkind/aspectratio module variables (for the outputs that actually exist / are available) and
	 * keeps their values live. Deliberately excludes the raw AWJ totalH/totalV fields (full video timing
	 * including blanking, e.g. 2200x1125 for a 1920x1080@60Hz signal per the CEA-861 standard) - a real but
	 * broadcast-engineering-only value with no use case in Companion button/feedback logic.
	 * aspectratio is NOT the device's own raw `aspectRatio` status field - confirmed live that's an output
	 * MODE setting (e.g. "NATIVE"), not a computed ratio, meaningless to display as-is. Computed here instead
	 * as width/height rounded to 3 decimals, recalculated whenever either changes - same approach used for
	 * MVW{n}.aspectratio and every S{n}/A{n}.aspectratio (screenSize below), per explicit user request.
	 */
	get outputStatus():Subscription {
		const pathFor = (item: string, prop: string) => `DEVICE/device/outputList/items/${item}/status/pp/${prop}`
		const props: [string, string, string][] = [
			['sizeH', 'width', 'Width'],
			['sizeV', 'height', 'Height'],
			['rate', 'refreshrate', 'Refresh Rate'],
			['format', 'format', 'Format'],
			['formatKind', 'formatkind', 'Format Kind'],
		]
		const computeAspectRatio = (item: string): number | '' => {
			const w = this.instance.state.get(pathFor(item, 'sizeH'))
			const h = this.instance.state.get(pathFor(item, 'sizeV'))
			return w && h ? Math.round((w / h) * 1000) / 1000 : ''
		}

		return {
			pat: `device/outputList/items/(\\w+)/status/pp/(?:${props.map(([p]) => p).join('|')})`,
			ini: () => {
				this.instance.removeVariable('outputStatus')
				const items: string[] = this.instance.state.get('DEVICE/device/outputList/itemKeys') ?? []
				const paths: string[] = []
				for (const item of items) {
					if (this.instance.choices.getMultiviewerOutputListKeys().includes(item)) continue // multiviewer outputs get their own MVW{n}.* variables, see multiviewerOutputStatus
					if (!this.instance.state.get(pathFor(item, 'isAvailable'))) continue
					for (const [, varProp, label] of props) {
						this.instance.addVariable({ id: 'outputStatus', variableId: `OUT${item}.${varProp}`, name: `${label} of OUT${item}` })
					}
					this.instance.addVariable({ id: 'outputStatus', variableId: `OUT${item}.aspectratio`, name: `Aspect Ratio of OUT${item}` })
					paths.push(...props.map(([awjProp]) => pathFor(item, awjProp)))
				}
				return paths
			},
			fun: (path) => {
				if (!path || typeof path !== 'string') return false
				const match = path.match(new RegExp(`outputList/items/(\\w+)/status/pp/(${props.map(([p]) => p).join('|')})`))
				if (!match) return false
				const [, item, awjProp] = match
				if (this.instance.choices.getMultiviewerOutputListKeys().includes(item)) return false
				if (!this.instance.state.get(pathFor(item, 'isAvailable'))) return false
				const varProp = props.find(([p]) => p === awjProp)?.[1]
				if (!varProp) return false
				if (awjProp === 'rate') {
					const rate = this.instance.state.get(path)
					const hz = this.constants.outputRateInMilliHertz ? rate / 1000 : rate
					this.instance.setVariableValues({ [`OUT${item}.refreshrate`]: Math.round(hz * 100) / 100 })
				} else {
					this.instance.setVariableValues({ [`OUT${item}.${varProp}`]: this.instance.state.get(path) })
				}
				if (awjProp === 'sizeH' || awjProp === 'sizeV') {
					this.instance.setVariableValues({ [`OUT${item}.aspectratio`]: computeAspectRatio(item) })
				}
				return false
			},
		}
	}

	/** A physical output's label (name) changes. Registers out{n}.label, mirroring screenLabel/auxscreenLabel -
	 *  separate from outputStatus since the label lives under control/pp, not status/pp like the other out{n}.* props. */
	get outputLabel():Subscription {
		const pathFor = (item: string) => `DEVICE/device/outputList/items/${item}/control/pp/label`
		const availablePath = (item: string) => `DEVICE/device/outputList/items/${item}/status/pp/isAvailable`

		return {
			pat: 'device/outputList/items/(\\w+)/control/pp/label',
			ini: () => {
				this.instance.removeVariable('outputLabel')
				const items: string[] = this.instance.state.get('DEVICE/device/outputList/itemKeys') ?? []
				const paths: string[] = []
				for (const item of items) {
					if (this.instance.choices.getMultiviewerOutputListKeys().includes(item)) continue
					if (!this.instance.state.get(availablePath(item))) continue
					this.instance.addVariable({ id: 'outputLabel', variableId: `OUT${item}.label`, name: `Label of Output ${item}` })
					paths.push(pathFor(item))
				}
				return paths
			},
			fun: (path) => {
				if (!path || typeof path !== 'string') return false
				const match = path.match(/outputList\/items\/(\w+)\/control\/pp\/label/)
				if (!match) return false
				const item = match[1]
				if (this.instance.choices.getMultiviewerOutputListKeys().includes(item)) return false
				if (!this.instance.state.get(availablePath(item))) return false
				this.instance.setVariableValues({ [`OUT${item}.label`]: this.instance.state.get(path) })
				return false
			},
		}
	}

	/**
	 * A physical output's plug (connector) status changes. Registers out{n}.hdcp/colorspace/sinkdetected/
	 * sinkname module variables (for the outputs that actually exist / are available) and keeps them live.
	 * "Sink" is the correct AV/HDMI term for whatever is on the receiving end (monitor, projector, LED wall, ...).
	 * SDI/Quad SDI is unidirectional - there is no return channel a sink could use to signal its presence, so
	 * the device can never actually detect one (unlike HDMI/DisplayPort's hotplug/EDID). Per explicit user
	 * request (2026-08-28), `.sinkdetected` is hard-coded to `true` for those plug types instead of passing
	 * through whatever the device happens to report, which would otherwise misleadingly read as "nothing
	 * connected" even with a real, working SDI sink attached.
	 */
	get outputPlugStatus():Subscription {
		const outputAvailablePath = (item: string) => `DEVICE/device/outputList/items/${item}/status/pp/isAvailable`
		const pathFor = (item: string, prop: string) => `DEVICE/device/outputList/items/${item}/plugList/items/1/status/pp/${prop}`
		const props: [string, string, string][] = [
			['isHdcp', 'hdcp', 'HDCP'],
			['colorSpace', 'colorspace', 'Color Space'],
			['isMonitorDetected', 'sinkdetected', 'Sink Detected'],
			['monitorName', 'sinkname', 'Sink Name'],
		]
		const isSdiOutput = (item: string): boolean => {
			const type = this.instance.state.get(`DEVICE/device/outputList/items/${item}/plugList/items/1/status/pp/type`)
			return type === 'SDI' || type === 'QUAD_SDI'
		}
		const valueFor = (item: string, varProp: string, rawValue: string | number | boolean): string | number | boolean =>
			varProp === 'sinkdetected' && isSdiOutput(item) ? true : rawValue
		const nameFor = (item: string, varProp: string, label: string): string =>
			varProp === 'sinkdetected'
				? `Is Output ${item} connected to a device? Always 'true' for SDI`
				: `${label} of OUT${item}`

		return {
			pat: `device/outputList/items/(\\w+)/plugList/items/1/status/pp/(?:${props.map(([p]) => p).join('|')})`,
			ini: () => {
				this.instance.removeVariable('outputPlugStatus')
				const items: string[] = this.instance.state.get('DEVICE/device/outputList/itemKeys') ?? []
				for (const item of items) {
					if (this.instance.choices.getMultiviewerOutputListKeys().includes(item)) continue // multiviewer outputs are not "physical outputs", see multiviewerOutputStatus
					if (!this.instance.state.get(outputAvailablePath(item))) continue
					for (const [awjProp, varProp, label] of props) {
						this.instance.addVariable({ id: 'outputPlugStatus', variableId: `OUT${item}.${varProp}`, name: nameFor(item, varProp, label) })
						this.instance.setVariableValues({ [`OUT${item}.${varProp}`]: valueFor(item, varProp, this.instance.state.get(pathFor(item, awjProp))) })
					}
				}
				return []
			},
			fun: (path) => {
				if (!path || typeof path !== 'string') return false
				const match = path.match(new RegExp(`outputList/items/(\\w+)/plugList/items/1/status/pp/(${props.map(([p]) => p).join('|')})`))
				if (!match) return false
				const [, item, awjProp] = match
				if (this.instance.choices.getMultiviewerOutputListKeys().includes(item)) return false
				if (!this.instance.state.get(outputAvailablePath(item))) return false
				const varProp = props.find(([p]) => p === awjProp)?.[1]
				if (!varProp) return false
				this.instance.setVariableValues({ [`OUT${item}.${varProp}`]: valueFor(item, varProp, this.instance.state.get(path)) })
				return false
			},
		}
	}

	/**
	 * Which Screen or Aux an output is currently feeding, if any. Registers OUT{n}.usedin only for outputs
	 * where isAvailable is true (actually installed on this hardware) - matches outputStatus/outputPlugStatus's
	 * own existing isAvailable-gating precedent (deliberately not "every theoretical output slot regardless of
	 * state" - see inputActive's comment for why that approach caused a variable-count spike elsewhere).
	 * Raw device value is "NONE" when unused, or a screen/aux id like "S1"/"A2" - flattened to "" per explicit
	 * user request ("wenn ungenutzt \"\"").
	 */
	get outputUsedIn():Subscription {
		const pathFor = (item: string) => `DEVICE/device/outputList/items/${item}/canvas/status/pp/usedInScreenAux`
		const availablePath = (item: string) => `DEVICE/device/outputList/items/${item}/status/pp/isAvailable`

		return {
			pat: 'device/outputList/items/(\\w+)/canvas/status/pp/usedInScreenAux',
			ini: () => {
				this.instance.removeVariable('outputUsedIn')
				const items: string[] = this.instance.state.get('DEVICE/device/outputList/itemKeys') ?? []
				const paths: string[] = []
				for (const item of items) {
					if (this.instance.choices.getMultiviewerOutputListKeys().includes(item)) continue
					if (!this.instance.state.get(availablePath(item))) continue
					this.instance.addVariable({ id: 'outputUsedIn', variableId: `OUT${item}.usedin`, name: `Screen/Aux using Output ${item}` })
					paths.push(pathFor(item))
				}
				return paths
			},
			fun: (path) => {
				if (!path || typeof path !== 'string') return false
				const match = path.match(/outputList\/items\/(\w+)\/canvas\/status\/pp\/usedInScreenAux/)
				if (!match) return false
				const item = match[1]
				if (this.instance.choices.getMultiviewerOutputListKeys().includes(item)) return false
				if (!this.instance.state.get(availablePath(item))) return false
				const usedIn = this.instance.state.get(path)
				this.instance.setVariableValues({ [`OUT${item}.usedin`]: usedIn && usedIn !== 'NONE' ? usedIn : '' })
				return false
			},
		}
	}

	/**
	 * A multiviewer's own output signal (resolution, format, refresh rate, ...). Registers MVW{n}.width/height/
	 * refreshrate/format/formatkind/aspectratio variables (one set per multiviewer that
	 * actually exists, via the existing cross-platform getMultiviewerArray()/getMultiviewerOutputPath()
	 * abstraction) and keeps them live. Named "MVW{n}.*" - "MVW" (not "MV") per explicit user request, to
	 * match WebRCS's own multiviewer-output naming and avoid colliding with the unrelated "MV{n}.label"
	 * Multiviewer Memory slot variables (multiviewerMemoryLabel above) - both used a bare "MV{n}" prefix
	 * before this fix despite being two entirely different numbering domains (output identity vs. memory
	 * slot number). Aquilon (base) sources this from its own device/monitoringList; Midra's override of
	 * getMultiviewerOutputPath() points this at the same device/outputList "MTVW" entry that outputStatus/
	 * outputPlugStatus now deliberately exclude, so a given multiviewer's data always ends up under MVW{n}.*
	 * only, consistently across platforms, instead of sometimes also under an out{n}.* alias.
	 */
	get multiviewerOutputStatus():Subscription {
		const props: [string, string][] = [
			['sizeH', 'width'],
			['sizeV', 'height'],
			['rate', 'refreshrate'],
			['format', 'format'],
			['formatKind', 'formatkind'],
		]
		const pathFor = (id: string, prop: string) => ['DEVICE', ...this.instance.choices.getMultiviewerOutputPath(id), 'status', 'pp', prop].join('/')
		// Confirmed live: device/monitoringList/items/{n}/status/pp has no aspectRatio field at all (unlike
		// outputList, which has one but only as a meaningless "NATIVE" mode setting) - computed here instead,
		// same width/height-based approach as outputStatus/screenSize, per explicit user request.
		const computeAspectRatio = (id: string): number | '' => {
			const w = this.instance.state.get(pathFor(id, 'sizeH'))
			const h = this.instance.state.get(pathFor(id, 'sizeV'))
			return w && h ? Math.round((w / h) * 1000) / 1000 : ''
		}

		return {
			pat: `(?:monitoringList|outputList)/items/\\w+/status/pp/(?:${props.map(([p]) => p).join('|')})`,
			ini: () => {
				this.instance.removeVariable('multiviewerOutputStatus')
				const paths: string[] = []
				for (const id of this.instance.choices.getMultiviewerArray()) {
					for (const [, varProp] of props) {
						this.instance.addVariable({ id: 'multiviewerOutputStatus', variableId: `MVW${id}.${varProp}`, name: `${varProp} of Multiviewer ${id}` })
					}
					this.instance.addVariable({ id: 'multiviewerOutputStatus', variableId: `MVW${id}.aspectratio`, name: `aspectratio of Multiviewer ${id}` })
					paths.push(...props.map(([awjProp]) => pathFor(id, awjProp)))
				}
				return paths
			},
			fun: (path) => {
				if (!path || typeof path !== 'string') return false
				for (const id of this.instance.choices.getMultiviewerArray()) {
					for (const [awjProp, varProp] of props) {
						if (path !== pathFor(id, awjProp)) continue
						if (awjProp === 'rate') {
							const rate = this.instance.state.get(path)
							const hz = this.constants.outputRateInMilliHertz ? rate / 1000 : rate
							this.instance.setVariableValues({ [`MVW${id}.refreshrate`]: Math.round(hz * 100) / 100 })
						} else {
							this.instance.setVariableValues({ [`MVW${id}.${varProp}`]: this.instance.state.get(path) })
						}
						if (awjProp === 'sizeH' || awjProp === 'sizeV') {
							this.instance.setVariableValues({ [`MVW${id}.aspectratio`]: computeAspectRatio(id) })
						}
						return false
					}
				}
				return false
			},
		}
	}

	/**
	 * A multiviewer's own enable state toggles (e.g. turning off a "duplicate of another multiviewer" mode
	 * to make it its own independent output) - forces multiviewerOutputStatus's `ini` to run again so a
	 * newly-enabled multiviewer's MVW{n}.* variables get registered right away. Needed because
	 * getMultiviewerArray() filters by isEnabled, and multiviewerOutputStatus only calls addVariable() once,
	 * inside its own `ini` - a multiviewer that wasn't enabled yet when that ran (e.g. at connect time) was
	 * silently excluded from ever getting variables, even though its status changes would still (uselessly)
	 * match multiviewerOutputStatus's own `pat` once enabled. Confirmed live: enabling Multiviewer 2 after
	 * connect did not produce MVW2.* variables until this fix. Broad (?:monitoringList|outputList) pattern
	 * matches multiviewerOutputStatus's own, including plain physical outputs' isEnabled - harmless, since
	 * re-running that init pass is cheap (a handful of multiviewers at most).
	 */
	get multiviewerEnabledChange():Subscription {
		return {
			pat: '(?:monitoringList|outputList)/items/\\w+/status/pp/isEnabled',
			fun: () => {
				this.initSubscriptions('multiviewerOutputStatus')
				return false
			},
		}
	}

	/**
	 * Generic device identity: model series (product family, e.g. "Midra 4K"), model (specific product, e.g.
	 * "Eikos 4k"), and device name (the user-configurable device label). Series/model are static per connection
	 * (set once by connection.ts on connect - they can't change without a reconnect, which re-runs this anyway);
	 * name is live, since a device can be relabeled without reconnecting.
	 */
	get deviceIdentity():Subscription {
		const labelPathFor = (deviceListPrefix: string) => `DEVICE/device/system/${deviceListPrefix}pp/label`

		return {
			pat: 'device/system/(?:deviceList/items/\\d+/)?pp/label',
			ini: () => {
				this.instance.removeVariable('deviceIdentity')
				this.instance.addVariable({ id: 'deviceIdentity', variableId: 'Device.Series', name: 'Device model series' })
				this.instance.addVariable({ id: 'deviceIdentity', variableId: 'Device.Model', name: 'Device model' })
				this.instance.addVariable({ id: 'deviceIdentity', variableId: 'Device.Name', name: 'Device name (label)' })
				this.instance.addVariable({ id: 'deviceIdentity', variableId: 'Device.FirmwareVersion', name: 'Device firmware version' })
				this.instance.addVariable({ id: 'deviceIdentity', variableId: 'Device.FirmwareGeneration', name: 'Device firmware generation (e.g. V4)' })

				const labelPath = this.instance.state.get(labelPathFor('')) !== undefined ? labelPathFor('') : labelPathFor('deviceList/items/1/')
				return ['LOCAL/deviceModel', 'LOCAL/deviceSeries', 'LOCAL/deviceFirmwareVersion', 'LOCAL/deviceFirmwareGeneration', labelPath]
			},
			fun: (path) => {
				if (!path || typeof path !== 'string') return false
				if (path === 'LOCAL/deviceModel') {
					this.instance.setVariableValues({ 'Device.Model': this.instance.state.get(path) ?? '' })
				} else if (path === 'LOCAL/deviceSeries') {
					this.instance.setVariableValues({ 'Device.Series': this.instance.state.get(path) ?? '' })
				} else if (path === 'LOCAL/deviceFirmwareVersion') {
					this.instance.setVariableValues({ 'Device.FirmwareVersion': this.instance.state.get(path) ?? '' })
				} else if (path === 'LOCAL/deviceFirmwareGeneration') {
					this.instance.setVariableValues({ 'Device.FirmwareGeneration': this.instance.state.get(path) ?? '' })
				} else {
					this.instance.setVariableValues({ 'Device.Name': this.instance.state.get(path) ?? '' })
				}
				return false
			},
		}
	}

	/** Real installed input/output counts (Device.NumberOfInputs/.NumberOfOutputs), useful for Companion project
	 *  logic that needs to know how much I/O a connected device actually has. Recomputed (not just re-read) on
	 *  every relevant isAvailable change, since it's a live count, not a fixed per-platform maximum.
	 *  Deliberately counts isAvailable only, NOT getLiveInputArray() (which also excludes preconfig-hidden/
	 *  disabled-but-installed inputs) - this is meant to answer "how much I/O hardware exists", not "how many
	 *  inputs would show up in a source picker" - see [[feedback_preconfig_visibility_not_existence]]. */
	get deviceIOCount():Subscription {
		const countInputs = () => this.instance.state.get('DEVICE/device/inputList/itemKeys')?.filter((k: string) => this.instance.state.get(`DEVICE/device/inputList/items/${k}/status/pp/isAvailable`)).length ?? 0
		const countOutputs = () => this.instance.choices.getOutputArray().filter((o) => !this.instance.choices.getMultiviewerOutputListKeys().includes(o.id)).length

		return {
			pat: 'device/(?:inputList|outputList)/items/\\w+/status/pp/isAvailable',
			ini: () => {
				this.instance.removeVariable('deviceIOCount')
				this.instance.addVariable({ id: 'deviceIOCount', variableId: 'Device.NumberOfInputs', name: 'Number of real installed inputs' })
				this.instance.addVariable({ id: 'deviceIOCount', variableId: 'Device.NumberOfOutputs', name: 'Number of real installed outputs' })
				this.instance.setVariableValues({ 'Device.NumberOfInputs': countInputs(), 'Device.NumberOfOutputs': countOutputs() })
				return []
			},
			fun: () => {
				this.instance.setVariableValues({ 'Device.NumberOfInputs': countInputs(), 'Device.NumberOfOutputs': countOutputs() })
				return false
			},
		}
	}

	/**
	 * Aggregated device health for IF/THEN-style feedback use. Temperature uses the single aggregate alarm the
	 * AWJ protocol already provides (device/system/temperature/device/pp/alarm, e.g. "NONE"/"WARNING"/"ALARM").
	 * There is no equivalent single aggregate for fans - Device.Status.Fans is computed by scanning every "alarm"
	 * boolean anywhere under device/system/fan for a true value, so it adapts to whatever fan sub-lists (case
	 * fans, FPGA fans, ...) a given platform actually has instead of assuming a specific fan layout.
	 */
	get deviceHealth():Subscription {
		const temperaturePathFor = (deviceListPrefix: string) => `DEVICE/device/system/${deviceListPrefix}temperature/device/pp/alarm`
		const fanPathFor = (deviceListPrefix: string) => `DEVICE/device/system/${deviceListPrefix}fan`

		const anyAlarm = (obj: any): boolean => {
			if (obj === null || typeof obj !== 'object') return false
			for (const key in obj) {
				if (key === 'alarm' && obj[key] === true) return true
				if (anyAlarm(obj[key])) return true
			}
			return false
		}

		let deviceListPrefix = ''

		return {
			pat: 'device/system/(?:deviceList/items/\\d+/)?(?:temperature/device/pp/alarm|fan/.*alarm)',
			fbk: 'deviceHealthStatus',
			ini: () => {
				this.instance.removeVariable('deviceHealth')
				this.instance.addVariable({ id: 'deviceHealth', variableId: 'Device.Status.Temperature', name: 'Device temperature alarm status' })
				this.instance.addVariable({ id: 'deviceHealth', variableId: 'Device.Status.Fans', name: 'Device fan alarm status' })

				deviceListPrefix = this.instance.state.get(temperaturePathFor('')) !== undefined ? '' : 'deviceList/items/1/'
				return [temperaturePathFor(deviceListPrefix), fanPathFor(deviceListPrefix)]
			},
			fun: (path) => {
				if (!path || typeof path !== 'string') return false
				if (path.includes('/temperature/')) {
					this.instance.setVariableValues({ 'Device.Status.Temperature': this.instance.state.get(temperaturePathFor(deviceListPrefix)) ?? '' })
				} else {
					this.instance.setVariableValues({ 'Device.Status.Fans': anyAlarm(this.instance.state.get(fanPathFor(deviceListPrefix))) ? 'ALARM' : 'OK' })
				}
				return false
			},
		}
	}

	/** device is shut down */
	get shutdown():Subscription {
		return {
			pat: 'DEVICE/device/system/shutdown/cmd/pp/xRequest',
			fun: (_path?: string | string[], value?: string | string[] | number | boolean): boolean => {
				if (value === 'SHUTDOWN') {
					this.instance.log('info', 'Device has been shut down.');
					this.instance.updateStatus(InstanceStatus.Ok, 'Shut down');
				}
				return false;
			},
		}
	}

	/** Used background set gets changed */
	get backgroundSet():Subscription {
		return {
			pat: 'DEVICE/device/screenList/items/((?:S|A)\\d{1,3})/presetList/items/(A|B)/background/source/pp',
			fbk: 'deviceSourceTally',
		}
	}

	/** Aux memory gets renamed (Midra only) */
	get auxMemoryLabel():Subscription {
		return {
			pat: 'DEVICE/device/preset/auxBank/slotList/items/(\\d+)/control/pp/label',
			ini: Array.from({ length: 200 }, (_, i) => (i + 1).toString()),
			fun: (path, _value) => {
				if (!path) return false;
				const memory = Array.isArray(path) ? path[6] : path.split('/')[6];
				const label = memory.toString() !== '0' ? this.instance.state.get(path) : '';
				const auxMemoryVarId = 'auxMemory' + memory + 'label'
				if (this.instance.state.get(path.toString().replace('control/pp/label', 'status/pp/isValid'))) {
					this.instance.addVariable({ id: 'auxMemoryLabel', variableId: auxMemoryVarId, name: `Label of Aux Memory ${memory}` })
				}
				this.instance.setVariableValues({ [auxMemoryVarId]: label });
				for (const screenId of this.instance.choices.getChosenAuxes('all')) {
					const pgmmem = this.instance.state.get([
						'DEVICE',
						'device',
						'auxiliaryScreenList',
						'items',
						screenId.replace(/\D/g, ''),
						'presetList',
						'items',
						this.instance.state.get('LOCAL/screens/' + screenId + '/pgm/preset'),
						'status',
						'pp',
						'memoryId',
					]);
					if (memory == pgmmem) {
						const pgmVarId = this.varName(`screen${screenId}memoryLabelPGM`, `${screenId}.pgm.memory.label`)
						this.instance.addVariable({ id: 'auxMemoryLabel', variableId: pgmVarId, name: `Label of memory in Program for ${screenId}` })
						this.instance.setVariableValues({ [pgmVarId]: label });
					}
					const pvwmem = this.instance.state.get([
						'DEVICE',
						'device',
						'auxiliaryScreenList',
						'items',
						screenId.replace(/\D/g, ''),
						'presetList',
						'items',
						this.instance.state.get('LOCAL/screens/' + screenId + '/pvw/preset'),
						'status',
						'pp',
						'memoryId',
					]);
					if (memory == pvwmem) {
						const pvwVarId = this.varName(`screen${screenId}memoryLabelPVW`, `${screenId}.prw.memory.label`)
						this.instance.addVariable({ id: 'auxMemoryLabel', variableId: pvwVarId, name: `Label of memory in Preview for ${screenId}` })
						this.instance.setVariableValues({ [pvwVarId]: label });
					}
				}
				return true;
			},
		}
	}

	/** The used plug of an input gets changed */
	get plugChange():Subscription {
		return {
			pat: 'DEVICE/device/inputList/items/(\\w+)/status/pp/plug',
			ini: Array.from({ length: 16 }, (_, i) => 'INPUT_' + (i + 1)),
			fun: (path, _value) => {
				if (!path) return false;
				const input = Array.isArray(path) ? path[4] : path.split('/')[4];
				const num = input.replace(/^\w+_/, '')
				const varId = this.varName(`INPUT_${num}label`, `IN${num}.label`)
				if (this.instance.state.get(['DEVICE', 'device', 'inputList', 'items', input, 'status', 'pp', 'isAvailable'])) {
					this.instance.addVariable({ id: 'plugChange', variableId: varId, name: `Label of Input ${input}` })
				}
				this.instance.setVariableValues({
					[varId]: this.instance.state.get([
						'DEVICE', 'device', 'inputList', 'items', input,
						'plugList', 'items', this.instance.state.get(path),
						'control', 'pp', 'label'
					])
				});
				return true;
			}
		}
	}

	/**
	 * Returns a string with the feedback ID if a feedback exists and runs an action if there is a 'fun' property
	 * @param pat The path in the state object to check if a feedback or action exists for, if undefined checks all possible subscriptions
	 * @returns an array containing the ids of feedbacks that need to be checked when a subscription matches. undefined if none
	 */
	checkForAction(pat?: string | string[], value?: any): string[] | undefined {
		// console.log('Checking for action', pat, value);
		const subscriptions = this.subscriptions
		let path: string
		if (pat === undefined) {
			let update = false
			for (const key of Object.keys(subscriptions)) {
				const subscriptionobj = subscriptions[key]
				if (subscriptionobj.fun && typeof subscriptionobj.fun === 'function') {
					update = subscriptionobj.fun()
				}
			}
			if (update) void this.instance.updateInstance()
			return undefined
		} else if (typeof pat === 'string') {
			path = pat
		} else if (Array.isArray(pat)) {
			path = pat.join('/')
		} else {
			return undefined
		}

		const subscriptionlist = Object.keys(subscriptions).filter((key) => {
			const regexp = new RegExp(subscriptions[key].pat)
			if (path.match(regexp)) {
				return true
			}
			return false
		})
		let ret: string[] = []
		subscriptionlist.forEach((subscription) => {
			// console.log('found subscription', subscription)
			const subscriptionobj = subscriptions[subscription]
			if (subscriptionobj.fun && typeof subscriptionobj.fun === 'function') {
				// console.log('found subscription fun')
				if (value) {
					const update = subscriptionobj.fun(path, value)
					if (update) void this.instance.updateInstance()
				} else {
					const update = subscriptionobj.fun(path)
					if (update) void this.instance.updateInstance()
				}
			}
			const fbk = subscriptions?.[subscription]?.fbk
			if (fbk) {
				// console.log('found feedback', fbk)
				if (typeof fbk === 'string') {
					ret.push(fbk)
				} else if (Array.isArray(fbk)) {
					ret.push(...fbk)
				}
			}
		})

		if (ret.length >= 1) {
			return ret
		} else {
			return undefined
		}
	}

	/**
	 * Checks if the subscriptions has some iterable output of the 'ini' property and uses this as the path variable for the function of the 'fun' property.  
	 * This has the same effect as if we would receive an update for all parameters observed by a subscription.  
	 * If any of the subscriptions wants to run updateInstance it will be done at the end
	 * @param subscription specific subscription or all subscriptions if omitted
	 */
	initSubscriptions(subscription?: string): void {
		const subscriptions = this.subscriptions
		let update = false

		const checkSub = (sub: string): boolean => {
			let update = false
			const subscriptionobj = subscriptions[sub]
			let pattern = subscriptionobj.pat
			if (subscriptionobj.fun && typeof subscriptionobj.fun === 'function') {
				if (pattern.indexOf('(') === -1) {
					subscriptionobj.fun(pattern)
				} else {
					if (subscriptionobj.ini && Array.isArray(subscriptionobj.ini)) {
						// if ini is array just replace the the one and only capturing group with all the values of the array and run the fun with all resulting paths
						while (pattern.match(/\([^()]+\)/)) {
							pattern = pattern.replace(/\([^()]+\)/g, '*')
						}
						for (const item of subscriptionobj.ini) {
							const upd = subscriptionobj.fun(pattern.replace('*', item))
							if (upd) update = true
						}
					} else if (subscriptionobj.ini && typeof subscriptionobj.ini === 'function') {
						// if ini is a function run fun with all the paths generated by ini
						subscriptionobj.ini(this.instance).forEach((path: string) => {
							if (subscriptionobj.fun && typeof subscriptionobj.fun === 'function') {
								subscriptionobj.fun(path)
							}
						})
					}

				}
			}
			return update
		}

		if (typeof subscription === 'string') {
			update = checkSub(subscription)

		} else {
			// check all subscriptions
			this.subscriptionList.forEach((sub) => {
				const upd = checkSub(sub)
				if (upd) update = true
			})
		}
		
		if (update) {
			void (async () => {
				try {
					void this.instance.updateInstance()
					this.instance.checkAllFeedbacks()
				} catch (error) {
					this.instance.log('error', 'Cannot update the this.instance. '+ error)
				}
			})()
		}
	}

}

