import { AWJinstance } from '../index.js'
import { State } from '../../types/State.js'
import Constants from './constants.js'
import { formatAquilonModel, compareFirmwareVersions } from '../util.js'
import { RECOMMENDED_FIRMWARE } from '../config.js'

type Dropdown<t> = {id: t, label: string}

export type Choicemeta = { id: string, label: string, index?: string, longname?: string, device?: number }

export type AnchorPoint = 'TOP_LEFT' | 'TOP_CENTER' | 'TOP_RIGHT' | 'LEFT_CENTER' | 'CENTER' | 'RIGHT_CENTER' | 'BOTTOM_LEFT' | 'BOTTOM_CENTER' | 'BOTTOM_RIGHT'

/**
 * Anchor-point math ported 1:1 from WebRCS's own source (aw-utils/geometry/position/anchor/anchor.ts,
 * changeAnchorPoint()), so this module's behavior matches WebRCS exactly, including its documented
 * pixel-rounding quirk for odd-sized boxes on certain anchors (their comment cites an internal ticket
 * about following real device rounding behavior).
 */
const ANCHOR_RATIO: Record<AnchorPoint, {x: number, y: number}> = {
	TOP_LEFT: {x: 0, y: 0},
	TOP_CENTER: {x: 0.5, y: 0},
	TOP_RIGHT: {x: 1, y: 0},
	LEFT_CENTER: {x: 0, y: 0.5},
	CENTER: {x: 0.5, y: 0.5},
	RIGHT_CENTER: {x: 1, y: 0.5},
	BOTTOM_LEFT: {x: 0, y: 1},
	BOTTOM_CENTER: {x: 0.5, y: 1},
	BOTTOM_RIGHT: {x: 1, y: 1},
}
const isPixelOffsetRequired = (anchor: AnchorPoint): boolean =>
	anchor === 'TOP_LEFT' || anchor === 'TOP_CENTER' || anchor === 'LEFT_CENTER' || anchor === 'BOTTOM_LEFT'
const adjustPixelValue = (value: number, oldAnchor: AnchorPoint, newAnchor: AnchorPoint): number => {
	if (!Number.isInteger(value)) {
		if (isPixelOffsetRequired(oldAnchor) || isPixelOffsetRequired(newAnchor)) {
			return Math.trunc(value) + (value > 0 ? 1 : -1)
		}
		return Math.trunc(value)
	}
	return value
}

/**
 * Methods for retrieving device dependent data like properties, lists, choices out of the state or generating it
 */
export default class Choices {
	/** reference to the instance */
	instance: AWJinstance
	/** The state object to take the data from */
	state: State
	/** reference to the constants of the device */
	constants: typeof Constants

	constructor(instance: AWJinstance) {
		this.instance = instance
		this.state = this.instance.state
		this.constants = instance.constants
	}

	/**
	 * A dropdown with zero choices (e.g. a freshly factory-reset device with no Screens/Memories configured
	 * yet) leaves Companion with nothing to render, and any previously stored option value then fails
	 * validation as "not in the list of choices" - live-confirmed 2026-08-28 against a factory-reset Aquilon
	 * (no Screens, no Screen/Master/Layer Memories at all). Rather than leaving the list empty, every
	 * *Choices() method below falls back to a single informational, non-functional placeholder entry so the
	 * dropdown stays valid and the reason is visible instead of it just silently not working - matches the
	 * empty-string default already used elsewhere when nothing is available (e.g. `?.id ?? ''`).
	 * Distinguishes "genuinely nothing configured" from "no device has ever answered yet" (relevant now that
	 * the generic action set is published before any connection exists, see index.ts init()) - `DEVICE` is
	 * only ever set once, wholesale, from the first successful REST snapshot (`state.set('DEVICE', res)` in
	 * connection.ts), so its mere presence reliably means "we have seen real device data at least once",
	 * regardless of whether we're currently connected/reconnecting.
	 */
	private placeholderIfEmpty(list: Dropdown<string>[], label: string): Dropdown<string>[] {
		if (list.length > 0) return list
		const everConnected = !!this.state.get('DEVICE')
		return [{ id: '', label: everConnected ? label : 'No device connected' }]
	}

	/**
	 * While no device has ever answered yet, the generic/default Choices class (this one - platform-specific
	 * subclasses permanently replace it in setDevice() the moment a real device is identified, so this only
	 * ever runs during that initial window) synthesizes the full theoretical-maximum range for the given axis
	 * instead of a single "(emulated)" example or an empty list - lets a user pre-program buttons offline by
	 * picking e.g. "Input 42" or "S15" directly, which then correctly resolves once a real device with that
	 * many Inputs/Screens actually connects. Uses the base Constants class's own numbers, which are already
	 * the largest value across all three platforms for every one of these axes (confirmed 2026-08-28 by
	 * comparing livepremier/livepremier4/midra's constants.ts) - so the offline list is never too short for
	 * whichever platform ends up connecting. If a real (even if empty) list is already available - meaning a
	 * platform-specific subclass's own override actually ran - this is a no-op; genuinely-empty-after-
	 * connecting stays handled by placeholderIfEmpty()'s "No X configured", never by this.
	 */
	private syntheticRangeIfNeverConnected(real: Choicemeta[], count: number, buildId: (n: number) => string): Choicemeta[] {
		if (real.length > 0) return real
		if (this.state.get('DEVICE')) return real
		return Array.from({ length: count }, (_, i) => ({ id: buildId(i + 1), label: '', index: (i + 1).toString() }))
	}

	// 'prw' is the current, preferred value for Preview (matches the PVW->PRW variable-naming rename). The
	// legacy 'pvw' value is deliberately NOT listed here (2026-08-28: an earlier attempt added it as a visible
	// second "Preview (legacy value...)" choice, which just confused users with two near-identical entries).
	// Instead, every "Preset (Program/Preview)" field using this list also sets `allowInvalidValues: true`, so
	// a button saved before this rename with 'pvw' still stored keeps validating fine (Companion tolerates a
	// stored value that isn't in the current choices list) without 'pvw' needing to clutter the dropdown -
	// never remove that flag from those fields. Everything reading this option already treats 'pvw'/'prw' as
	// fully equivalent regardless (see e.g. getPresetSelection()'s regex, or the inline `=== 'prw' ? 'pvw' :`
	// normalization in a few action callbacks).
	choicesPreset: Dropdown<string>[] = [
		{ id: 'prw', label: 'Preview' },
		{ id: 'pgm', label: 'Program' },
	]

	choicesPresetLong: Dropdown<string>[] = [
		{ id: 'PROGRAM', label: 'Program' },
		{ id: 'PREVIEW', label: 'Preview' },
	]

	choicesBackgroundSources: Dropdown<string>[] = [
		{ id: 'NATIVE_1', label: 'Background Set 1' },
		{ id: 'NATIVE_2', label: 'Background Set 2' },
		{ id: 'NATIVE_3', label: 'Background Set 3' },
		{ id: 'NATIVE_4', label: 'Background Set 4' },
		{ id: 'NATIVE_5', label: 'Background Set 5' },
		{ id: 'NATIVE_6', label: 'Background Set 6' },
		{ id: 'NATIVE_7', label: 'Background Set 7' },
		{ id: 'NATIVE_8', label: 'Background Set 8' },
	]

	choicesBackgroundSourcesPlusNone: Dropdown<string>[] = [
		{ id: 'NONE', label: 'None / Color' },
		...this.choicesBackgroundSources,
	]

	/**
	 * Takes a string like S1 or A2 and returns an object with a lot of parameters, some are different depending on the platform
	 * @param screen 
	 * @returns 
	 */
	getScreenInfo(screen: string) {
		let ret = {
			/** Id like S1, A2 */
			id: '',
			/** Id like S1 for Livepremier, 1 for Midra */
			platformId: '',
			/** Id like S1 for Livepremier, SCREEN_1 for Midra */
			platformLongId: '',
			/** S or A */
			prefix: '',
			/** number of screen as string */
			numstr: '',
			/** number of screen as number */
			number: NaN,
			/** is it a screen */
			isScreen: false,
			/** is it an auxiliary screen */
			isAux: false,
			/** screen or auxScreen */
			prefixlong: '',
			/** screen or auxiliaryScreen */
			prefixverylong: '',
			/** Aux or empty */
			prefixAux: '',
			/** Auxiliary or empty */
			prefixAuxLong: ''
		}
		if (screen.startsWith('S')) {
			const numstr = screen.replace(/\D/g, '')
			const num = parseInt(numstr)
			ret = {
				id: `S${numstr}`,
				platformId: `S${numstr}`,
				platformLongId: `S${numstr}`,
				prefix: 'S',
				numstr,
				number: num,
				isScreen: true,
				isAux: false,
				prefixlong: 'screen',
				prefixverylong: 'screen',
				prefixAux: '',
				prefixAuxLong: ''
			}
		}
        else if (screen.startsWith('A')) {
			const numstr = screen.replace(/\D/g, '')
			const num = parseInt(numstr)
			ret = {
				id: `A${numstr}`,
				platformId: `A${numstr}`,
				platformLongId: `A${numstr}`,
				prefix: 'A',
				numstr: num.toString(),
				number: num,
				isScreen: false,
				isAux: true,
				prefixlong: 'auxScreen',
				prefixverylong: 'auxiliaryScreen',
				prefixAux: 'Aux',
				prefixAuxLong: 'Auxiliary'
			}
		}

        return ret
	}

	public getScreensAuxArray(getAlsoDisabled = false): Choicemeta[] {
		return [...this.getScreensArray(getAlsoDisabled), ...this.getAuxArray(getAlsoDisabled)]
	}

	/** returns array of the currently available and active screens only (no auxes)*/
	public  getScreensArray(_getAlsoDisabled = false): Choicemeta[] {
		return this.syntheticRangeIfNeverConnected([], this.constants.maxScreens, (n) => `S${n}`)
	}

	public getScreenChoices(): Dropdown<string>[] {

		return this.placeholderIfEmpty(this.getScreensArray().map((scr: Choicemeta) => {
			return {
				id: scr.id,
				label: `S${scr.index}${scr.label === '' ? '' : ' - ' + scr.label}`
			}
		}), 'No Screens configured')
	}

	/** returns array of the currently available and active auxscreens only (no regular screens)*/
	public getAuxArray(_getAlsoDisabled = false ): Choicemeta[] {
		return this.syntheticRangeIfNeverConnected([], this.constants.maxAuxScreens, (n) => `A${n}`)
	}

	public getAuxChoices(): Dropdown<string>[] {

		return this.placeholderIfEmpty(this.getAuxArray().map((scr: Choicemeta) => {
			return {
				id: scr.id,
				label: `A${scr.index}${scr.label === '' ? '' : ' - ' + scr.label}`
			}
		}), 'No Auxscreens configured')
	}

	public getScreenAuxChoices(): Dropdown<string>[] {
		return this.placeholderIfEmpty([
			...this.getScreensArray().map((scr: Choicemeta) => {
			return {
				id: scr.id,
				label: `S${scr.index}${scr.label === '' ? '' : ' - ' + scr.label}`
			}
			}),
			...this.getAuxArray().map((scr: Choicemeta) => {
			return {
				id: scr.id,
				label: `A${scr.index}${scr.label === '' ? '' : ' - ' + scr.label}`
			}
			})
		], 'No Screens/Auxscreens configured')
	}

	public getPlatformScreenChoices(): Dropdown<string>[] {
		return []
	}

	public getLiveInputArray(prefix?: string): Choicemeta[] {
		return this.syntheticRangeIfNeverConnected([], this.constants.maxInputs, (n) => `${prefix ?? 'IN'}_${n}`)
	}

	public getLiveInputChoices(prefix?: string): Dropdown<string>[] {
		const ret: Dropdown<string>[] = []
		const inputs = this.getLiveInputArray(prefix)

		for (const input of inputs) {
			ret.push({
				id: input.id,
				label: `Input ${input.index}${
					input.label.length === 0 ? '' : ' - ' + input.label
				}`,
			})
		}
		return this.placeholderIfEmpty(ret, 'No Inputs configured')
	}

	choicesForegroundImagesSource: Dropdown<string>[] = []

	public getStillsArray(): Choicemeta[] {
		const bankpath = 'DEVICE/device/stillList/'
		return (
			this.state.get(this.state.concat(bankpath, 'itemKeys'))?.filter((itm: string) => {
				return this.state.get(this.state.concat(bankpath, ['items', itm, 'status', 'pp', 'isAvailable'])) && this.state.get(this.state.concat(bankpath, ['items', itm, 'status', 'pp', 'isValid']))
			}).map((itm: string) => {
				return {
					id: itm,
					label: this.state.get(this.state.concat(bankpath, ['items',itm,'control','pp','label',]))
				}
			}) ?? []
		)
	}

	/** All Image Store slots that actually exist on this device (licensed/available), meant as the target of an "assign image" action. Empty slots are included, since assigning is how you fill them. "Show also not existing..." additionally lists every slot up to maxStills, for pre-programming before a bigger/differently-licensed device is connected. */
	public getStillStoreChoices(): Dropdown<string>[] {
		const bankpath = 'DEVICE/device/stillList/'
		const availableIds = new Set<string>(
			(this.state.get(this.state.concat(bankpath, 'itemKeys')) ?? []).filter((itm: string) =>
				this.state.get(this.state.concat(bankpath, ['items', itm, 'status', 'pp', 'isAvailable']))
			)
		)
		if (availableIds.size === 0 && !this.state.get('DEVICE')) {
			return Array.from({ length: this.constants.maxStills }, (_, i) => ({ id: `${i + 1}`, label: `${i + 1}` }))
		}
		const maxN = this.instance.config.showNotExisting
			? this.constants.maxStills
			: Math.max(0, ...[...availableIds].map(Number).filter((n) => !Number.isNaN(n)))
		const ret: Dropdown<string>[] = []
		for (let n = 1; n <= maxN; n += 1) {
			const id = `${n}`
			if (availableIds.has(id)) {
				const label = this.state.get(this.state.concat(bankpath, ['items', id, 'control', 'pp', 'label']))
				const isValid = this.state.get(this.state.concat(bankpath, ['items', id, 'status', 'pp', 'isValid']))
				ret.push({ id, label: `${id}${label ? ' - ' + label : ''}${isValid ? '' : ' (empty)'}` })
			} else if (this.instance.config.showNotExisting) {
				ret.push({ id, label: `${id} (not existing)` })
			}
		}
		return ret
	}

	/** All valid images in the Image Library, with file name and resolution, meant as the source of an "assign image" action */
	public getStillLibraryArray(): Choicemeta[] {
		const bankpath = this.constants.stillLibraryPath
		return (
			this.state.get(bankpath + '/itemKeys')?.filter((itm: string) => {
				return this.state.get(this.state.concat(bankpath, ['items', itm, 'status', 'pp', 'isValid']))
			}).map((itm: string) => {
				const fileName = this.state.get(this.state.concat(bankpath, ['items', itm, 'status', 'pp', 'fileName']))
				const width = this.state.get(this.state.concat(bankpath, ['items', itm, 'status', 'pp', 'width']))
				const height = this.state.get(this.state.concat(bankpath, ['items', itm, 'status', 'pp', 'height']))
				return {
					id: itm,
					label: `${fileName}${width && height ? ` (${width}x${height})` : ''}`,
				}
			}) ?? []
		)
	}

	public getStillLibraryChoices(): Dropdown<string>[] {
		return this.getStillLibraryArray().map((itm) => {
			return {
				id: itm.id,
				label: `${itm.id} - ${itm.label}`,
			}
		})
	}

	/** The 4 device timers plus all occupied Image Library slots, meant as the source of an "assign to Image Store" action. Timer ids (e.g. "TIMER_1") and library ids (plain numbers) never collide. */
	public getStillTimerAndLibraryChoices(): Dropdown<string>[] {
		return [...this.getTimerChoices(), ...this.getStillLibraryChoices()]
	}

	public getSourceChoices(): Dropdown<string>[] {
		// first add None and Color which are always available
		const ret:Dropdown<string>[] = [
			{ id: 'NONE', label: 'None' },
			{ id: 'COLOR', label: 'Color' },
		]
		return ret
	}

	public getAuxSourceChoices(): Dropdown<string>[] {
		// first add None and Color which are always available
		const ret: Dropdown<string>[] = [
			{ id: 'NONE', label: 'None' },
		]

		return ret
	}

	public getPlugChoices(input: string): Dropdown<string>[] {
		const plugtype = {
			HDMI: 'HDMI',
			SDI: 'SDI',
			DISPLAY_PORT: 'DisplayPort',
			ANALOG_HD15: 'Analog HD15',
			OPTICAL_SFP: 'Optical',
			DVI_D: 'DVI-D',
			HDBASET: 'HDbaseT',
			QUAD_SDI: 'Quad SDI',
			NDI: 'NDI'
		}
		return this.state.get(['DEVICE', 'device', 'inputList', 'items', input, 'plugList', 'itemKeys'])?.filter(
			(plug: string) => {
				return this.state.get(['DEVICE', 'device', 'inputList', 'items', input, 'plugList', 'items', plug, 'status', 'pp', 'isAvailable'])
			}
		).map(
			(plug: string) => {
				const type: keyof typeof plugtype = this.state.get(['DEVICE', 'device', 'inputList', 'items', input, 'plugList', 'items', plug, 'status', 'pp', 'type'])
				return {
					id: plug,
					label: 'Plug ' + plug + ' - ' + plugtype[type]
				}
			}
		) ?? []
	}

	/**
	 * Shared firmware-version gate for features that exist on this same Aquilon hardware line (LivePremier/
	 * LivePremier4) but only from a certain firmware version onward (Backup, Layer Properties - Keying, Effects
	 * - Strobe, individual Layer Freeze, Anchor Point control, the TIMER{n}.value variable, ...). Compares the
	 * full dotted version (e.g. "5.0.128"), not just the major number, via the same compareFirmwareVersions()
	 * used by config.ts's isFirmwareBelow() - so a gate can require e.g. "4.04.77", not only a whole major
	 * version. Reads `LOCAL/deviceFirmwareVersion` (set once per connect in connection.ts as the device's raw
	 * reported version, e.g. "6.2.73") live/fresh here - no separate reactivity mechanism needed, since action/
	 * feedback getters re-run every time allActions/allFeedbacks is rebuilt (on every updateInstance(),
	 * including right after connect). Public/shared (moved from actions.ts) so both actions and feedbacks can
	 * gate on the same firmware check.
	 * Before a real device has ever connected (no `LOCAL/deviceFirmwareVersion` known yet), this optimistically
	 * assumes the newest firmware this module knows about (config.ts's RECOMMENDED_FIRMWARE, currently ahead of
	 * every gate in use) rather than the most conservative "not supported" - per explicit user decision: a show
	 * gets pre-programmed offline before ever touching the real device, and every gated action/feedback should
	 * stay fully configurable during that, not silently reduced to a firmware-notice placeholder just because
	 * nothing is connected yet. Once a real connection lands, the actual reported version takes over immediately
	 * (see this getter's own doc comment above on why no separate reactivity mechanism is needed for that).
	 */
	public isFirmwareAtLeast(minVersion: string): boolean {
		const fwVersion: string = this.instance.state.get('LOCAL/deviceFirmwareVersion') ?? ''
		if (!fwVersion) return compareFirmwareVersions(RECOMMENDED_FIRMWARE, minVersion) >= 0
		return compareFirmwareVersions(fwVersion, minVersion) >= 0
	}

	/**
	 * Resolves a "Backup Set" dropdown value (as produced by getBackupSetChoices(), "INPUT:IN_n" or
	 * "GROUP:GROUP_n") to the AWJ path of its control.pp object (without the leading "device" - matches
	 * connection.sendWSmessage()'s own path convention, callers prepend 'DEVICE' themselves for state reads).
	 * Public/shared (moved from actions.ts) so both actions and feedbacks can resolve the same target.
	 */
	public getBackupControlPath(target: string): string[] | undefined {
		const [kind, ...rest] = (target ?? '').split(':')
		if (kind === 'INPUT' && rest[0]) return ['device', 'inputList', 'items', rest[0], 'backup', 'control', 'pp']
		if (kind === 'GROUP' && rest[0]) return ['device', 'backup', 'groupList', 'items', rest[0], 'control', 'pp']
		if (kind === 'BGSET' && rest[0] && rest[1]) {
			return ['device', 'preconfig', 'backgrounds', 'screenList', 'items', rest[0], 'backgroundSetList', 'items', rest[1], 'backup', 'control', 'pp']
		}
		return undefined
	}

	/**
	 * Backup Sets (backup-enabled inputs) and Backup Groups, meant as the target for the "Backups" actions.
	 * An input that is a member of a Group is deliberately left out of this list - per Analog Way's own Backup
	 * UI, a grouped input's backup only ever gets switched together with its Group, so only the Group appears
	 * (confirmed live: IN_12/IN_13 both had backup.control.pp.group === 'GROUP_1' and only "Testgroup1" is
	 * meant to be selectable, not the two inputs individually).
	 * Ungrouped Backup Sets have no name of their own (unlike Groups), so the label is built from the actual
	 * assigned sources instead: "Primary: <input> > Backup1: <source> > Backup2: <source>", with an unused
	 * slot's segment left out entirely (a Backup Set can have only Backup1, only Backup2, or both set).
	 */
	public getBackupSetChoices(): Dropdown<string>[] {
		const ret: Dropdown<string>[] = []
		const inputKeys: string[] = this.state.get(['DEVICE', 'device', 'inputList', 'itemKeys']) ?? []
		for (const key of inputKeys) {
			const backupControl = this.state.get(['DEVICE', 'device', 'inputList', 'items', key, 'backup', 'control', 'pp'])
			// `group` may be entirely absent (not just 'NONE') on some firmware, e.g. live-observed on 6.0.4 -
			// a missing group field means "not in a group" just as much as an explicit 'NONE' does, so only
			// exclude when a group is actually, positively set to something else.
			if (!backupControl?.enable || (backupControl.group !== undefined && backupControl.group !== 'NONE')) continue
			const primaryLabel = this.state.get(['DEVICE', 'device', 'inputList', 'items', key, 'control', 'pp', 'label'])
			const parts = [`Primary: ${key.replace(/^\w+_/, 'Input ')}${primaryLabel ? ' - ' + primaryLabel : ''}`]
			for (const slot of ['1', '2']) {
				const source = this.state.get(['DEVICE', 'device', 'inputList', 'items', key, 'backup', 'slotList', 'items', slot, 'control', 'pp', 'source'])
				if (!source || source === 'NONE') continue
				const sourceLabel = this.getSourceChoices().find((choice) => choice.id === source)?.label ?? source
				parts.push(`Backup${slot}: ${sourceLabel}`)
			}
			ret.push({ id: `INPUT:${key}`, label: parts.join(' > ') })
		}
		// Background Set backups - live-confirmed (2026-08-28) on a real Aquilon: a completely separate
		// structure from Input backups, one independent backup config per Screen per Background Set slot at
		// DEVICE/device/preconfig/backgrounds/screenList/items/{screen}/backgroundSetList/items/{1-8}/backup -
		// same control/status/slotList shape as an input's own backup, but the "sources" being backed up are
		// other Background Sets (NATIVE_n) on the SAME screen, not live inputs. Scoped to real/enabled screens
		// only (not all 24 theoretical ones), matching this module's established registration-scope rule.
		// Requires firmware 6.1.57+ (Analog Way's release notes: Background Set backup didn't exist before -
		// only Input backup did, since 5.0.128). Explicitly gated here rather than relying on `enable` staying
		// false on old firmware, so an entry never silently appears from stale/cached state.
		for (const scr of this.isFirmwareAtLeast('6.1.57') ? this.getScreensArray() : []) {
			for (const setNum of ['1', '2', '3', '4', '5', '6', '7', '8']) {
				const bgPath = ['DEVICE', 'device', 'preconfig', 'backgrounds', 'screenList', 'items', scr.id, 'backgroundSetList', 'items', setNum, 'backup']
				const backupControl = this.state.get([...bgPath, 'control', 'pp'])
				// See the matching comment in the Input Backup loop above - a missing `group` field counts as
				// ungrouped too, not just an explicit 'NONE'.
				if (!backupControl?.enable || (backupControl.group !== undefined && backupControl.group !== 'NONE')) continue
				const parts = [`Primary: ${scr.id} Background Set ${setNum}`]
				for (const slot of ['1', '2']) {
					const source = this.state.get([...bgPath, 'slotList', 'items', slot, 'control', 'pp', 'source'])
					if (!source || source === 'NONE') continue
					const sourceLabel = this.choicesBackgroundSources.find((choice) => choice.id === source)?.label ?? source
					parts.push(`Backup${slot}: ${sourceLabel}`)
				}
				ret.push({ id: `BGSET:${scr.id}:${setNum}`, label: parts.join(' > ') })
			}
		}
		const groupKeys: string[] = this.state.get(['DEVICE', 'device', 'backup', 'groupList', 'itemKeys']) ?? []
		for (const key of groupKeys) {
			// status.pp.isEnabled reflects whether the group currently has member inputs/Background Sets assigned,
			// i.e. is "in use" (confirmed live: both Testgroup1 and Testgroup2 show isEnabled=true, an unused
			// GROUP_n does not) - the same GROUP_n pool is shared between Input and Background Set backups.
			if (!this.state.get(['DEVICE', 'device', 'backup', 'groupList', 'items', key, 'status', 'pp', 'isEnabled'])) continue
			const label = this.state.get(['DEVICE', 'device', 'backup', 'groupList', 'items', key, 'control', 'pp', 'label'])
			const num = key.replace('GROUP_', '')
			ret.push({ id: `GROUP:${key}`, label: `Backup Group ${num}${label ? ' - ' + label : ''}` })
		}
		return this.placeholderIfEmpty(ret, 'No Backup Set configured')
	}

	/**
	 * DEVICE-relative path (prefix 'device' included, matching getBackupControlPath()'s own convention - callers
	 * prepend 'DEVICE' themselves for state reads) to a Background Set's per-output content control field, e.g.
	 * device/preconfig/backgrounds/screenList/items/S1/backgroundSetList/items/2/outputList/items/4/control/pp/
	 * content. Live-confirmed (2026-09-08) on a real Aquilon: `outputList` under a Background Set lists every
	 * physical output in the whole (possibly linked, up to 96) system, not just the ones belonging to this
	 * screen - see getScreenOutputArray() for the piece that actually scopes this down to a given screen's real
	 * outputs.
	 */
	public getBackgroundSetOutputContentPath(screen: string, bgSet: string, output: string): string[] {
		return ['device', 'preconfig', 'backgrounds', 'screenList', 'items', screen, 'backgroundSetList', 'items', bgSet, 'outputList', 'items', output, 'control', 'pp', 'content']
	}

	/**
	 * The physical outputs actually feeding a given Screen (never an Aux - Background Sets don't exist there),
	 * live-derived from each output's own `canvas.status.pp.usedInScreenAux` field rather than assumed from the
	 * Background Set's own outputList (which - see getBackgroundSetOutputContentPath()'s comment - always lists
	 * every output in the whole system, linked chassis included, regardless of which screen actually uses it).
	 * Scoped to outputs that are actually available in the currently connected system, not the theoretical max.
	 */
	public getScreenOutputArray(screen: string): Choicemeta[] {
		const outputKeys: string[] = this.state.get(['DEVICE', 'device', 'outputList', 'itemKeys']) ?? []
		return outputKeys
			.filter((key) => this.state.get(['DEVICE', 'device', 'outputList', 'items', key, 'canvas', 'status', 'pp', 'usedInScreenAux']) === screen)
			.map((key) => ({ id: key, label: `Output ${key}` }))
	}

	/** Which real Screen (never an Aux - Background Sets don't exist there) a physical output currently feeds,
	 * or undefined if it isn't feeding any Screen right now - the reverse lookup of getScreenOutputArray(). */
	public getScreenForOutput(output: string): string | undefined {
		const usedIn: string | undefined = this.state.get(['DEVICE', 'device', 'outputList', 'items', output, 'canvas', 'status', 'pp', 'usedInScreenAux'])
		return usedIn?.startsWith('S') ? usedIn : undefined
	}

	/** Every physical output currently feeding any real Screen, across the whole (possibly linked) system, in
	 * this module's own `OUT{n}` naming convention (matches the `OUT{n}.*` variables) rather than the plain
	 * numeric output keys getOutputChoices() elsewhere in the module uses - meant for a single flat "Output"
	 * picker that doesn't need a separate "Screen" field (see devicePreconfigBackgroundSetSourceStatus). */
	public getBackgroundScreenOutputChoices(): Dropdown<string>[] {
		const outputKeys: string[] = this.state.get(['DEVICE', 'device', 'outputList', 'itemKeys']) ?? []
		return outputKeys
			.filter((key) => this.getScreenForOutput(key) !== undefined)
			.map((key) => ({ id: `OUT${key}`, label: `Output ${key} (${this.getScreenForOutput(key)})` }))
	}

	/**
	 * DEVICE-relative path to a Background Set source's own `useOnOutput` control field - live-confirmed
	 * (2026-09-08): setting a Background Set output's `content` (getBackgroundSetOutputContentPath()) alone
	 * leaves it reporting `isContentValid: false` until this is ALSO set once, to any output number the source
	 * is compatible with (device/preconfig/backgrounds/inputList-or-stillList/items/{key}/status/pp/
	 * outputsCompatibility lists which). This is a property of the *source* itself, not of one particular
	 * Screen/Background Set/output triple - setting it once validates every existing reference to that source
	 * sharing a compatible output format, confirmed live: assigning Input 8 to 4 different outputs, then setting
	 * useOnOutput just once for Input 8, flipped isContentValid to true on all 4 simultaneously. Returns
	 * undefined for 'NONE' (no source to validate) - callers should skip sending anything in that case.
	 */
	public getBackgroundContentUseOnOutputPath(content: string): string[] | undefined {
		if (content === 'NONE') return undefined
		if (content.startsWith('LIVE_')) return ['device', 'preconfig', 'backgrounds', 'inputList', 'items', `IN_${content.replace('LIVE_', '')}`, 'control', 'pp', 'useOnOutput']
		if (content.startsWith('STILL_')) return ['device', 'preconfig', 'backgrounds', 'stillList', 'items', content.replace('STILL_', ''), 'control', 'pp', 'useOnOutput']
		return undefined
	}

	/**
	 * Converts a Background Set output's raw AWJ `content` id ('LIVE_n', 'STILL_n' - see
	 * getBackgroundSetOutputContentPath()) to this module's own short source naming convention ('IN{n}',
	 * 'IMG{n}') used everywhere else a source is exposed to the user (variables, other actions/feedbacks) -
	 * mirrors subscriptions.ts's formatSourceShort(), the canonical definition of this mapping (not reused
	 * directly - that one is private to the Subscriptions class and covers more kinds (NATIVE/SCREEN/TIMER)
	 * than this needs). 'NONE' stays 'NONE'; anything unrecognized is passed through unchanged.
	 */
	public backgroundContentToShortSource(content: string): string {
		const match = content.match(/^(LIVE|STILL)_(\d+)$/)
		if (!match) return content
		return match[1] === 'LIVE' ? `IN${match[2]}` : `IMG${match[2]}`
	}

	/**
	 * The reverse of backgroundContentToShortSource() - converts this module's short source id ('IN8', 'IMG3')
	 * back to the raw AWJ `content` id ('LIVE_8', 'STILL_3') a Background Set output's `content` field actually
	 * expects. 'NONE' stays 'NONE'; anything unrecognized (including 'COLOR', not offered as a Background Set
	 * choice - see getBackgroundSetContentChoices()) is passed through unchanged.
	 */
	public shortSourceToBackgroundContent(shortId: string): string {
		const match = shortId.match(/^(IN|IMG)(\d+)$/)
		if (!match) return shortId
		return match[1] === 'IN' ? `LIVE_${match[2]}` : `STILL_${match[2]}`
	}

	/**
	 * The value vocabulary for a Background Set output's `content` field, in this module's own short source
	 * naming convention (see backgroundContentToShortSource()) rather than the raw AWJ ids - 'NONE', 'IN{n}'
	 * for a live input, 'IMG{n}' for an Image Store slot (stillList's own item keys are plain numbers, e.g.
	 * '3' - this prefixes them; NOT the same id as the Still Store dropdown elsewhere in the module uses).
	 * 'COLOR' deliberately excluded per explicit user decision - WebRCS's own Backgrounds page never offers it
	 * as a per-output content choice here; a solid color background is only ever set via a Screen Preset, a
	 * different concept entirely.
	 */
	public getBackgroundSetContentChoices(): Dropdown<string>[] {
		return [
			{ id: 'NONE', label: 'None' },
			...this.getLiveInputChoices('LIVE').map((c) => ({ id: this.backgroundContentToShortSource(c.id), label: c.label })),
			...this.getStillsArray().map((still) => ({ id: `IMG${still.id}`, label: `Still ${still.id}${still.label ? ' - ' + still.label : ''}` })),
		]
	}

	public getMasterMemoryArray(): Choicemeta[] {
		const bankpath = 'DEVICE/device/masterPresetBank/bankList'
		const real: Choicemeta[] = (
			this.state.get(this.state.concat(bankpath, 'itemKeys'))?.filter((mem: string) => {
				return this.state.get(this.state.concat(bankpath, ['items', mem, 'status', 'pp', 'isValid']))
			}).map((mem: string) => {
				return {
					id: mem,
					label: this.state.get(this.state.concat(bankpath, ['items',mem,'control','pp','label',]))
				}
			}) ?? []
		)
		return this.syntheticRangeIfNeverConnected(real, this.constants.maxMasterMemories, (n) => `${n}`)
	}

	public getMasterMemoryChoices(): Dropdown<string>[] {

		return this.placeholderIfEmpty(this.getMasterMemoryArray().map((mem: Choicemeta) => {
			return {
				id: mem.id,
				label: `MM${mem.id}${mem.label === '' ? '' : ' - ' + mem.label}`
			}
		}), 'No Master Memories configured')
	}

	public getScreenMemoryArray(): Choicemeta[] {
		let bankpath = this.constants.screenMemoryPath

		const real: Choicemeta[] = (
			this.state.get(this.state.concat('DEVICE', bankpath, 'itemKeys'))?.filter((mem: string) => {
				return this.state.get(this.state.concat('DEVICE', bankpath, ['items', mem, 'status', 'pp', 'isValid']))
			}).map((mem: string) => {
				return {
					id: mem,
					label: this.state.get(this.state.concat('DEVICE', bankpath, ['items',mem,'control','pp','label',]))
				}
			}) ?? []
		)
		return this.syntheticRangeIfNeverConnected(real, this.constants.maxScreenMemories, (n) => `${n}`)
	}

	public getScreenMemoryChoices(): Dropdown<string>[] {

		return this.placeholderIfEmpty(this.getScreenMemoryArray().map((mem: Choicemeta) => {
			return {
				id: mem.id,
				label: `SM${mem.id}${mem.label === '' ? '' : ' - ' + mem.label}`
			}
		}), 'No Screen Memories configured')
	}

	/**
	 * Every Screen Memory slot (both already-saved/valid ones AND empty/unused ones), for "Save to Slot"-style
	 * actions where an empty slot is a valid, common target - unlike getScreenMemoryArray()/getScreenMemoryChoices()
	 * (used for Recall), which deliberately only ever list already-valid slots since you can't recall nothing.
	 */
	public getAllScreenMemorySlotArray(): Choicemeta[] {
		const bankpath = this.constants.screenMemoryPath

		const real: Choicemeta[] = (
			this.state.get(this.state.concat('DEVICE', bankpath, 'itemKeys'))?.map((mem: string) => {
				const isValid = this.state.get(this.state.concat('DEVICE', bankpath, ['items', mem, 'status', 'pp', 'isValid']))
				return {
					id: mem,
					label: isValid ? this.state.get(this.state.concat('DEVICE', bankpath, ['items', mem, 'control', 'pp', 'label'])) : '',
				}
			}) ?? []
		)
		return this.syntheticRangeIfNeverConnected(real, this.constants.maxScreenMemories, (n) => `${n}`)
	}

	public getAllScreenMemorySlotChoices(): Dropdown<string>[] {
		const usedIds = new Set(this.getScreenMemoryArray().map((mem) => mem.id))
		return this.placeholderIfEmpty(this.getAllScreenMemorySlotArray().map((mem: Choicemeta) => {
			return {
				id: mem.id,
				label: usedIds.has(mem.id) ? `SM${mem.id}${mem.label === '' ? '' : ' - ' + mem.label} (overwrite)` : `SM${mem.id} (empty)`
			}
		}), 'No Screen Memories configured')
	}

	/** First currently-empty (not yet valid) Screen Memory slot id, or undefined if every slot is already used. */
	public getNextAvailableScreenMemorySlot(): string | undefined {
		const usedIds = new Set(this.getScreenMemoryArray().map((mem) => mem.id))
		return this.getAllScreenMemorySlotArray().find((mem) => !usedIds.has(mem.id))?.id
	}

	/** Layer keying presets ("Keyer Bank") - live-confirmed (2026-08-27) on a LivePremier4 device at
	 * device/keyerBank/bankList/items/{SLOT_n}, same {control.pp.label, status.pp.isValid} shape as the other
	 * memory banks. Not yet verified whether this path is identical on Midra. Creating/editing a keying preset's
	 * own content is WebRCS's job, not this module's - we only ever select which existing preset a layer uses. */
	public getKeyingPresetArray(): Choicemeta[] {
		const bankpath = ['device', 'keyerBank', 'bankList']

		return (
			this.state.get(this.state.concat('DEVICE', bankpath, 'itemKeys'))?.filter((slot: string) => {
				return this.state.get(this.state.concat('DEVICE', bankpath, ['items', slot, 'status', 'pp', 'isValid']))
			}).map((slot: string) => {
				return {
					id: slot,
					label: this.state.get(this.state.concat('DEVICE', bankpath, ['items', slot, 'control', 'pp', 'label']))
				}
			}) ?? []
		)
	}

	public getKeyingPresetChoices(): Dropdown<string>[] {
		return this.placeholderIfEmpty(this.getKeyingPresetArray().map((mem: Choicemeta) => {
			return {
				id: mem.id,
				label: `${mem.id.replace('SLOT_', 'Keying Memory ')}${mem.label === '' ? '' : ' - ' + mem.label}`
			}
		}), 'No Keying Memories configured')
	}

	public getAuxMemoryArray(): Choicemeta[] {
		return []
	}

	public getAuxMemoryChoices(): Dropdown<string>[] {
		return []
	}

	public getLayerMemoryArray(): Choicemeta[] {
		const real: Choicemeta[] = (
			(this.state.get('DEVICE/device/layerBank/bankList/itemKeys')?.filter((mem: string) => {
				return this.state.get(['DEVICE', 'device', 'layerBank', 'bankList', 'items', mem, 'status', 'pp', 'isValid'])
			}) ?? [])
			.map(
				(id: string) => {
					return {
						id,
						label: this.state.get(['DEVICE', 'device', 'layerBank', 'bankList', 'items', id, 'control', 'pp', 'label'])
					}
				}
			)
		)
		// no dedicated max-Layer-Memory constant exists (unlike Screen/Master/Multiviewer Memory) - Layer
		// Memory shares the same general preset-bank mechanism as Screen Memory, so maxScreenMemories is used
		// as the best available stand-in until a real per-axis number is confirmed.
		return this.syntheticRangeIfNeverConnected(real, this.constants.maxScreenMemories, (n) => `${n}`)
	}

	public getLayerMemoryChoices(): Dropdown<string>[] {
		return this.placeholderIfEmpty(this.getLayerMemoryArray().map((memory) => {return {
			id: memory.id,
			label: `LM${memory.id}${memory.label === '' ? '' : ' - ' + memory.label}`,
		}}), 'No Layer Memories configured')
	}

	public getMultiviewerMemoryArray(): Choicemeta[] {
		const bankpath = this.constants.multiviewerMemoryPath
		const real: Choicemeta[] = (
			this.state.get(bankpath + '/itemKeys')?.filter((mem: string) => {
				return this.state.get(this.state.concat(bankpath,['items', mem, 'status', 'pp', 'isValid']))
			}).map((mem: string) => {
				return {
					id: mem,
					label: this.state.get(this.state.concat(bankpath, ['items',mem,'control','pp','label',]))
				}
			}) ?? []
		)
		return this.syntheticRangeIfNeverConnected(real, this.constants.maxMultiviewerMemories, (n) => `${n}`)
	}

	public getMultiviewerMemoryChoices(): Dropdown<string>[] {

		return this.placeholderIfEmpty(this.getMultiviewerMemoryArray().map((mem: Choicemeta) => {
			return {
				id: mem.id,
				label: `VM${mem.id}${mem.label === '' ? '' : ' - ' + mem.label}`
			}
		}), 'No Multiviewer Memories configured')
	}

	public getMultiviewerArray(): string[] {
		return (
			this.state.get('DEVICE/device/monitoringList/itemKeys')?.filter((mvKey: string) => {
				return this.state.get(['DEVICE', 'device', 'monitoringList', 'items', mvKey, 'status', 'pp', 'isEnabled']) == true
			}) ?? ['1']
		)
	}

	/** Path to a multiviewer's own physical output status/control data (resolution, format, ...). Aquilon
	 *  (base) keeps this in its own device/monitoringList structure, separate from device/outputList. */
	public getMultiviewerOutputPath(multiviewerId: string): string[] {
		return ['device', 'monitoringList', 'items', multiviewerId]
	}

	/** device/outputList item keys (if any) that are actually a multiviewer's output rather than a "real"
	 *  physical output - none on Aquilon (base), since its multiviewer output isn't part of outputList at all. */
	public getMultiviewerOutputListKeys(): string[] {
		return []
	}

	public getMultiviewerChoices(): Dropdown<string>[] {
		const ret: Dropdown<string>[] = []
		for (const multiviewer of this.getMultiviewerArray()) {
			const label = this.state.get(['DEVICE', 'device', 'monitoringList', 'items', multiviewer, 'control', 'pp', 'label'])
			ret.push({
				id: multiviewer,
				label: `Multiviewer ${multiviewer}${label ? ' - ' + label : ''}`,
			})
		}
		return this.placeholderIfEmpty(ret, 'No Multiviewers configured')
	}

	public getWidgetChoices(): Dropdown<string>[] {
		const ret: Dropdown<string>[] = []
		for (const multiviewer of this.getMultiviewerArray()) {
			for (const widget of this.state.get([
				'DEVICE',
				'device',
				'monitoringList',
				'items',
				multiviewer,
				'layout',
				'widgetList',
				'itemKeys',
			]) ?? []) {
				ret.push({
					id: `${multiviewer}:${widget}`,
					label: `Multiviewer ${multiviewer} Widget ${parseInt(widget)+1}`,
				})
			}
		}

		return this.placeholderIfEmpty(ret, 'No Widgets configured')
	}

	public getWidgetSourceChoices(): Dropdown<string>[] {
		// first add None which is always available
		const ret: Dropdown<string>[] = [{ id: 'NONE', label: 'None' }]

		// next add live inputs
		ret.push(...this.getLiveInputChoices())

		// next add timer
		ret.push(...this.getTimerChoices())

		return ret
	}

	/**
	 * Translates a Layer id coming from an option field into the real internal id expected by device paths/state
	 * comparisons throughout the module. 'BG' (the user-facing choice id for the Background Layer, chosen so
	 * switching an option to Expression Mode shows something intuitive instead of raw AWJ protocol jargon) is
	 * translated to 'NATIVE'. 'NATIVE' typed directly is still accepted unchanged, for backward compatibility
	 * with already-saved configs and for users who already know the protocol term - never remove that.
	 */
	public normalizeLayerId(id: string): string {
		return id === 'BG' ? 'NATIVE' : id
	}

	/**
	 * Returns array with some layer choices
	 * @param param if it is a number that number of layer choices are returned, if it is a string the layers of the screen are returned
	 * @param bkg whether to include only live layers (false) or also background and possibly foreground layer (true or omitted)
	 * @param top whether to include foreground layer if available, follows bkg if omitted
	*/
	public getLayersAsArray(param: string | number, bkg?: boolean, _top?: boolean): Choicemeta[] {
		if (typeof param === 'number') {
			const ret: Choicemeta[] = []
			if (bkg === undefined || bkg === true) ret.push({ id: 'BG', label: 'Background', longname: 'BKG' })
			for (let i = 1; i <= param; i += 1) {
				ret.push({ id: `${i.toString()}`, label: `Layer ${i.toString()}` })
			}
			return ret
		}
		// param is a screen/aux id (string) - the generic/default class has no per-screen layer count to read
		// yet, so offer the full theoretical-maximum range instead of nothing (see
		// syntheticRangeIfNeverConnected's own comment) - live-confirmed 2026-08-28 this was showing as
		// Companion's "??" unresolved-value rendering for a plain empty list with a non-matching default.
		const bkgEntry: Choicemeta[] = bkg === undefined || bkg === true ? [{ id: 'BG', label: 'Background', longname: 'BKG' }] : []
		return [...bkgEntry, ...this.syntheticRangeIfNeverConnected([], this.constants.maxLayers, (n) => `${n}`).map((l) => ({ ...l, label: `Layer ${l.index}` }))]
	}

	/**
	 * Returns array with some layer choices
	 * @param param if it is a number that number of layer choices are returned, if it is a string the layers of the screen are returned
	 * @param bkg whether to include only live layers (false) or also background and possibly foreground layer (true or omitted) 
	 * @param top whether to include foreground layer if available, follows bkg if omitted
	 */
	public getLayerChoices(param: string | number, bkg?: boolean, top?: boolean): Dropdown<string>[] {
		const ret: Dropdown<string>[] = this.getLayersAsArray(param, bkg, top)
			.map(layer => {
				return {
					id: layer.id,
					label: layer.label ?? layer.longname ?? layer.id
				}
			})
			?? []
		return this.placeholderIfEmpty(ret, 'No Layers configured')
	}

	/** The highest number of (non-background) layers actually configured on any single screen/aux on this
	 * device right now - meant to size a screen-unspecified Layer dropdown to what's really there instead of
	 * this platform's theoretical per-screen maximum (this.constants.maxLayers, which can be far higher than
	 * any real show ever uses - e.g. 128 on LivePremier4 - making such a dropdown needlessly long). Screen-
	 * specific Layer dropdowns already get this for free via getLayerChoices(screenId, ...), which reads that
	 * one screen's own configured layerCount - this is only needed where no single screen is chosen yet. */
	public getMaxConfiguredLayerCount(): number {
		return this.getScreenAuxChoices().reduce((max, screen) => {
			return Math.max(max, this.getLayersAsArray(screen.id, false).length)
		}, 1)
	}

	public getOutputArray(): Choicemeta[] {
		// Exclude any id that is actually a multiviewer's own output (Midra folds its "MTVW" entry into the
		// same outputList as real physical outputs, unlike Aquilon which keeps its multiviewer in a wholly
		// separate structure) - matches Aquilon's own behavior, where the multiviewer never appears as an
		// "Output" choice at all, instead of just relabeling it while still mixing it in (2026-08-28: user
		// explicitly asked for the Aquilon-consistent fix over a cosmetic-only relabel). Midra's Multiviewer
		// stays fully reachable via its own dedicated getMultiviewerChoices()/getMultiviewerArray() override.
		const multiviewerKeys = this.getMultiviewerOutputListKeys()
		// no dedicated max-Outputs constant exists - 96 matches this module's own established assumption for
		// the outputList array's theoretical size (see the registration-scope rule discussion elsewhere in
		// this project, "confirmed both are always-present 256/96-key state arrays").
		const maxOutputs = 96
		const availableIds = new Set<string>(
			(this.state.get('DEVICE/device/outputList/itemKeys') ?? []).filter((itm: string) =>
				!multiviewerKeys.includes(itm) && this.state.get('DEVICE/device/outputList/items/'+itm+'/status/pp/isAvailable') === true
			)
		)
		// "Show also not existing..." lists every output up to the theoretical maximum above (meant for
		// pre-programming before a bigger/different device is connected) - otherwise stop at the highest
		// number the connected device actually reports, same as before.
		const maxN = this.instance.config.showNotExisting
			? maxOutputs
			: Math.max(0, ...[...availableIds].map(Number).filter((n) => !Number.isNaN(n)))
		const real: Choicemeta[] = []
		for (let n = 1; n <= maxN; n += 1) {
			const id = `${n}`
			if (availableIds.has(id)) {
				real.push({ id, label: this.state.get('DEVICE/device/outputList/items/'+id+'/control/pp/label') ?? '', index: id })
			} else if (this.instance.config.showNotExisting) {
				real.push({ id, label: '', index: id })
			}
		}
		return this.syntheticRangeIfNeverConnected(real, maxOutputs, (n) => `${n}`)
	}

	public getOutputChoices(): Dropdown<string>[] {
		return this.placeholderIfEmpty(this.getOutputArray().map((itm: Choicemeta) => {
			return {
				id: itm.id,
				label: `Output ${itm.id}${itm.label === '' ? '' : ' - ' + itm.label}`
			}
		}), 'No Outputs configured')
	}

	/**
	 * getAudioOutputsArray
	 * @param device optional number of device to return outputs for
	 * @returns array of output describing objects
	 */
	public getAudioOutputsArray(_device?: number): Choicemeta[] {
		const ret: Choicemeta[] = []
		return ret
	}

	public getAudioOutputChoices(_device?: number): Dropdown<string>[] { 
		return []
	}

	public getAudioCustomBlockChoices(): Dropdown<string>[] {
		return []
	}

	public getAudioInputChoices(_device?: number): Dropdown<string>[] { 
		return []
	}

	public getTimerArray(): Choicemeta[] {
		const ret: Choicemeta[] = []
		const timers = this.state.get('DEVICE/device/timerList/items') ?? {}
		for (const timer of Object.keys(timers)) {
			ret.push({
				id: timer,
				label: timers[timer].control.pp.label,
				index: timer.replace(/^\w+_/, ''),
			})
		}
		return this.syntheticRangeIfNeverConnected(ret, this.constants.maxTimers, (n) => `TIMER_${n}`)
	}

	public getTimerChoices(): Dropdown<string>[] {

		return this.getTimerArray().map((itm: Choicemeta) => {
			return {
				id: itm.id,
				label: `Timer ${itm.index}${itm.label === '' ? '' : ' - ' + itm.label}`
			}
		})
	}

	public getAnchorPointChoices(): Dropdown<AnchorPoint>[] {
		return [
			{ id: 'TOP_LEFT', label: 'Top Left' },
			{ id: 'TOP_CENTER', label: 'Top Center' },
			{ id: 'TOP_RIGHT', label: 'Top Right' },
			{ id: 'LEFT_CENTER', label: 'Middle Left' },
			{ id: 'CENTER', label: 'Center' },
			{ id: 'RIGHT_CENTER', label: 'Middle Right' },
			{ id: 'BOTTOM_LEFT', label: 'Bottom Left' },
			{ id: 'BOTTOM_CENTER', label: 'Bottom Center' },
			{ id: 'BOTTOM_RIGHT', label: 'Bottom Right' },
		]
	}

	/**
	 * The anchor point currently selected in WebRCS's live Position & Size panel (a shared/synced value,
	 * confirmed live: writing it via the "Set Anchor Point" action updates WebRCS's own display and vice
	 * versa). Falls back to Center (the AWJ-native posH/posV reference point) if not yet known.
	 */
	public getGlobalAnchorPoint(): AnchorPoint {
		return (this.state.get('REMOTE/live/screens/layers/anchorPoint') as AnchorPoint | undefined) ?? 'CENTER'
	}

	/** Converts a position given relative to fromAnchor into the equivalent position relative to toAnchor, for a box of the given size. */
	public convertAnchorPosition(x: number, y: number, sizeH: number, sizeV: number, fromAnchor: AnchorPoint, toAnchor: AnchorPoint): {x: number, y: number} {
		const dx = adjustPixelValue((ANCHOR_RATIO[toAnchor].x - ANCHOR_RATIO[fromAnchor].x) * sizeH, fromAnchor, toAnchor)
		const dy = adjustPixelValue((ANCHOR_RATIO[toAnchor].y - ANCHOR_RATIO[fromAnchor].y) * sizeV, fromAnchor, toAnchor)
		return { x: x + dx, y: y + dy }
	}

	/** Resolves info about whatever is currently assigned as a layer's source: a normalized "number" (the
	 * bare input/Image Store id, without the IN_/STILL_ prefix - blank if nothing meaningful is assigned),
	 * a human-readable "name" (the input's or still's own label, falling back to "Input n"/"Still n" if
	 * unlabeled, or "none"/"Color"/"Timer n" for sources that aren't an input or still), and the pixel
	 * resolution - a live input's detected signal resolution, or a still image's stored resolution (looked
	 * up on the Image Store slot itself, falling back to the Image Library item it was assigned from).
	 * width/height are '' if unknown (e.g. Color, a Timer, or no signal detected). `layerPath` is a layer's
	 * DEVICE-relative path as returned by getLayerPath (prefixed onto screenPath/auxPath + presetList/items/{preset}). */
	public getLayerSourceInfo(layerPath: string[]): {number: string, name: string, width: number | '', height: number | ''} {
		const input = this.state.get(['DEVICE', ...layerPath, 'source', 'pp', 'inputNum'])

		// A layer's own source uses "LIVE_n" for a live input when assigned via WebRCS drag&drop (confirmed
		// live, matching the Backup subsystem's own convention) - "IN_n" accepted too defensively, but
		// inputList/plugList are keyed by "IN_n" either way, so the id must be normalized before lookup.
		// Also fixed: the active plug lives at status.pp.plug, not control.pp.plug (which doesn't exist -
		// silently fell back to the '1' default every time, masking the bug on single-plug inputs).
		const liveMatch = typeof input === 'string' ? input.match(/^(?:LIVE|IN)_(\d+)$/) : null
		if (liveMatch) {
			const inputKey = `IN_${liveMatch[1]}`
			const number = liveMatch[1]
			const name = this.state.get(`DEVICE/device/inputList/items/${inputKey}/control/pp/label`) || `Input ${number}`
			const plug = this.state.get(`DEVICE/device/inputList/items/${inputKey}/status/pp/plug`) || '1'
			const width = this.state.get(`DEVICE/device/inputList/items/${inputKey}/plugList/items/${plug}/status/signal/pp/imageWidth`)
			const height = this.state.get(`DEVICE/device/inputList/items/${inputKey}/plugList/items/${plug}/status/signal/pp/imageHeight`)
			return { number, name, width: width || '', height: height || '' }
		}

		// A layer's source references an Image Store slot as "STILL_<n>", while the store's own state is
		// keyed by the bare "<n>" (same id as getStillStoreChoices()) - strip the prefix before looking it up.
		const stillMatch = typeof input === 'string' ? input.match(/^STILL_(\d+)$/) : null
		if (stillMatch) {
			const stillId = stillMatch[1]
			const name = this.state.get(['DEVICE', 'device', 'stillList', 'items', stillId, 'control', 'pp', 'label']) || `Still ${stillId}`
			let width = this.state.get(['DEVICE', 'device', 'stillList', 'items', stillId, 'status', 'pp', 'width'])
			let height = this.state.get(['DEVICE', 'device', 'stillList', 'items', stillId, 'status', 'pp', 'height'])
			if (!width || !height) {
				const librarySource = this.state.get(['DEVICE', 'device', 'stillList', 'items', stillId, 'control', 'pp', 'source'])
				if (librarySource !== undefined) {
					width = this.state.get(this.state.concat(this.constants.stillLibraryPath, ['items', librarySource.toString(), 'status', 'pp', 'width']))
					height = this.state.get(this.state.concat(this.constants.stillLibraryPath, ['items', librarySource.toString(), 'status', 'pp', 'height']))
				}
			}
			return { number: stillId, name, width: width || '', height: height || '' }
		}

		if (input === 'COLOR') return { number: '', name: 'Color', width: '', height: '' }
		if (typeof input === 'string' && input.match(/^TIMER_/)) return { number: input.replace(/^TIMER_/, ''), name: `Timer ${input.replace(/^TIMER_/, '')}`, width: '', height: '' }
		return { number: '', name: 'none', width: '', height: '' }
	}

	/** Is a screen / preset combination locked */
	public isLocked(screen: string, preset: string): boolean {
		preset = preset.replace(/.+m.*/i, 'PROGRAM').replace(/.+w.*/i, 'PREVIEW')
		const useRemote = this.instance.state.syncSelection
		const path = useRemote ? ['REMOTE', 'live', 'screens'] : ['LOCAL']
		// LOCAL's presetModeLock object is keyed by the plain short id (e.g. "S1"/"A1" - see state.ts's default
		// and setScreenLock()/the "Lock Screen" action's own LOCAL branch), while REMOTE (WebRCS's own state) is
		// keyed by the platform's long id instead (e.g. Midra's "SCREEN_1"/"AUX_1"). Using platformLongId for
		// both here was a bug: on Midra (where platformLongId differs from id, unlike LivePremier/LivePremier4)
		// every LOCAL-mode ("sync selection" off) lookup silently missed, always reading as unlocked - or, for
		// the "all" branch, as permanently all-locked.
		const keyFor = (id: string) => useRemote ? this.getScreenInfo(id).platformLongId : this.getScreenInfo(id).id
		if (screen === 'all') {
			const allscreens = this.getChosenScreenAuxes('all').map(keyFor)
			return (
				allscreens.find((scr) => {
					return this.state.get([...path, 'presetModeLock', preset, scr]) === false
				}) === undefined
			)
		} else {
			return this.state.get([...path, 'presetModeLock', preset, keyFor(screen)])
		}
	}

	/**
	 * Locks or unlocks a single screen/aux's given preset side directly - shared helper backing the "Unlock Screen
	 * if locked?" / "Relock after change" convenience options on the Layer Properties actions (a module-only
	 * addition, not present in WebRCS, since users often don't notice a screen is locked). Mirrors the same
	 * REMOTE/LOCAL branching already used by the "Lock Screen" action, just for exactly one screen instead of its
	 * multi-screen/toggle UI.
	 */
	public setScreenLock(screen: string, preset: string, lock: boolean): void {
		const normalizedPreset = preset.replace(/.+m.*/i, 'PROGRAM').replace(/.+w.*/i, 'PREVIEW')
		const platformLongId = this.getScreenInfo(screen).platformLongId
		if (this.instance.state.syncSelection) {
			const pst = normalizedPreset === 'PREVIEW' ? 'Prw' : 'Pgm'
			this.instance.connection.sendWSdata('REMOTE', (lock ? 'lock' : 'unlock') + 'ScreenAuxes' + pst, '/live/screens/presetModeLock', [[platformLongId]])
		} else {
			this.state.set(['LOCAL', 'presetModeLock', normalizedPreset, screen], lock)
		}
		this.instance.checkFeedbacks('liveScreenLock')
	}

	/**
	 * Returns the currently selected preset or just the input if a specific preset is given.
	 * @param preset if omitted or if 'sel' then the currently selected preset is returned
	 * @param fullName if set to true the return value is PROGRAM/PREVIEW instead of pgm/pvw
	 * @returns
	 */
	getPresetSelection(preset?: string, fullName = false): 'pgm' | 'pvw' | 'PROGRAM' | 'PREVIEW' {
		let pst = preset
		if (preset === undefined || preset.match(/^sel$/i)) {
			if (this.instance.state.syncSelection) {
				pst = this.state.get('REMOTE/live/screens/presetModeSelection/presetMode')
			} else {
				pst = this.state.get('LOCAL/presetMode')
			}
		}
		if (pst && pst.match(/^pgm|program$/i) && !fullName) {
			return 'pgm'
		} else if (pst && pst.match(/^pvw|^prw|^prv|preview$/i) && !fullName) {
			return 'pvw'
		} else if (pst && pst.match(/^pgm|program$/i) && fullName) {
			return 'PROGRAM'
		} else if (pst && pst.match(/^pvw|^prw|^prv|preview$/i) && fullName) {
			return 'PREVIEW'
		} else if (fullName) {
			return 'PREVIEW'
		} else {
			return 'pvw'
		}
	}

	/**
	 * Returns the actual preset (A or B) representing program or preview of the given input or of the selection
	 * @param screen S1-S... or A1-A...
	 * @param preset can be A or B or PGM or PVW/PRW or 'sel', A and B are returned unchanged
	 * @returns A or B or '', whichever is the actual preset for program or preview, during fades the preset is changed only at the end of the fade
	 */
	public getPreset(screen: string, preset: string): string {
		if (screen.match(/^S|A\d+$/) === null) return ''
		// PVW and PRV are accepted for backwards compatibility / typo-tolerance alongside the current PRW -
		// never remove them
		if (preset.match(/^A|B|PGM|PVW|PRW|PRV|SEL$/i) === null) return ''
		if (preset.toLowerCase() === 'sel') {
			preset = this.getPresetSelection()
		}
		let ret: string
		if (preset.match(/^A|B$/i)) {
			ret = preset.toUpperCase()
		} else {
			// the internal state key is always 'pvw', regardless of whether the user typed PVW, PRW or PRV
			const presetSegment = ['PRW', 'PRV'].includes(preset.toUpperCase()) ? 'pvw' : preset.toLowerCase()
			ret = this.state.get(`LOCAL/screens/${screen}/${presetSegment}/preset`)
		}
		return ret
	}

	/**
	 * Returns the program or preview representing the given preset A or B of the screen
	 * @param screen S1-S... or A1-A...
	 * @param preset can be A or B
	 * @param fullName if true returnes PROGRAM/PREVIEW else pgm/pvw
	 * @returns program or preview, during fades the preset is changed only at the end of the fade
	 */
	public getPresetRev(screen: string, preset: string, fullName = false): string | null {
		if (screen.match(/^S|A\d+$/) === null) return null
		if (preset.match(/^A|B$/i) === null) return null
		let ret: string
		if (this.state.get(`LOCAL/screens/${screen}/pgm/preset`) === preset.toUpperCase()) {
			ret = fullName ? 'PROGRAM' : 'pgm'
		} else {
			ret = fullName ? 'PREVIEW' : 'pvw'
		}
		return ret
	}

	/**
	 * Splits any array elements that look like multiple concatenated screen/aux ids (e.g. a value like
	 * 'S1S2A1' coming from an expression built without a separator) into their individual ids (S1, S2, A1),
	 * so users can build such lists without needing a separator character. Leaves 'all'/'sel' keywords as-is.
	 * Ids that don't correspond to a currently existing screen/aux are silently dropped, since they could
	 * otherwise only come from an expression typo or an out-of-range value (real dropdown selections are
	 * already constrained to real choices, and 'allowInvalidValues' only relaxes that in expression mode).
	 * @param input array of strings to check
	 * @returns array with any concatenated ids split into individual, currently existing ids
	 */
	private expandScreenAuxTokens(input: string[]): string[] {
		const validIds = new Set([...this.getScreensArray(), ...this.getAuxArray()].map((s) => s.id))
		return input.flatMap((el) => {
			if (el === 'all' || el === 'sel') return [el]
			const tokens = el.match(/[SA]\d+/g)
			if (tokens === null) return [el]
			return tokens.filter((token) => validIds.has(token))
		})
	}

	/**
	 * Splits any array elements that look like multiple concatenated Audio Input Channel tokens (e.g. a value
	 * like 'IN1C1IN1C2' coming from an expression built without a separator) into their individual internal
	 * ids ('INPUT_1_CHANNEL_1', 'INPUT_1_CHANNEL_2'), mirroring expandScreenAuxTokens'/expandLayerTokens' own
	 * concatenation convention. 'IN{n}C{m}' is a direct shorthand for the exact raw AWJ id 'INPUT_{n}_CHANNEL_{m}'
	 * (the same raw per-card-slot addressing already used as the real option value, not the translated "Input X"
	 * video-input number shown in the choice label) - so this is a pure string reformat, no lookup needed. Any
	 * element that doesn't match (a literal raw id already, 'NONE', or a Dante id) passes through unchanged, so
	 * both notations - and the plain old array-of-raw-ids value shape - keep working side by side.
	 */
	private expandAudioInputTokens(input: string[]): string[] {
		return input.flatMap((el) => {
			const tokens = el.match(/IN\d+C\d+/gi)
			if (tokens === null) return [el]
			return tokens.map((token) => {
				const m = token.match(/IN(\d+)C(\d+)/i) as RegExpMatchArray
				return `INPUT_${m[1]}_CHANNEL_${m[2]}`
			})
		})
	}

	/**
	 * Returns the input Audio Input Channel token(s) ('IN1C1', or a concatenated 'IN1C1IN1C2'), translated and
	 * expanded into the individual internal ids ('INPUT_1_CHANNEL_1', ...). Also accepts (and passes through
	 * unchanged) already-raw ids like 'INPUT_1_CHANNEL_1', 'NONE', or a Dante channel id.
	 * @param input single Audio Input Channel token/expression string, or array of them
	 * @returns array of individual internal Audio Input Channel ids
	 */
	public getChosenAudioInputChannels(input: string | string[] | undefined): string[] {
		if (input === undefined) return []
		if (typeof input === 'string') {
			input = [input]
		}
		return this.expandAudioInputTokens(input)
	}

	/**
	 * Splits any array elements that look like multiple concatenated Layer tokens (e.g. a value like 'L1L2BG'
	 * coming from an expression built without a separator) into their individual internal Layer ids ('1', '2',
	 * 'NATIVE'), mirroring expandScreenAuxTokens' 'S1S2A1' convention for Screens/Auxscreens: numbered Layers
	 * are typed with an 'L' prefix (L1, L2, ...), the Background Layer is typed as 'BG' - both translated back
	 * to the real internal ids ('1'/'2'/.../'NATIVE') expected everywhere else in the module. Tokens outside
	 * the currently configured max layer count are silently dropped, same reasoning as expandScreenAuxTokens.
	 */
	private expandLayerTokens(input: string[]): string[] {
		const maxLayer = this.getMaxConfiguredLayerCount()
		return input.flatMap((el) => {
			const tokens = el.match(/L\d+|BG/g)
			if (tokens === null) return [el]
			return tokens
				.map((token) => (token === 'BG' ? 'NATIVE' : token.slice(1)))
				.filter((id) => id === 'NATIVE' || (parseInt(id) >= 1 && parseInt(id) <= maxLayer))
		})
	}

	/**
	 * Returns the input Layer token(s) ('L1', 'BG', or a concatenated 'L1L2BG'), translated and expanded into
	 * the individual internal Layer ids ('1', '2', 'NATIVE', ...).
	 * @param input single Layer token/expression string, or array of them
	 * @returns array of individual internal Layer ids
	 */
	public getChosenLayers(input: string | string[] | undefined): string[] {
		if (input === undefined) return []
		if (typeof input === 'string') {
			input = [input]
		}
		return this.expandLayerTokens(input)
	}

	/**
	 * Returns the input array of screens but extends it by all active screens or the selected screens if the input array contains 'all' or 'sel'
	 * @param input array of strings to check
	 * @param prefix what to write in front of the screen number, defaults to 'S'
	 * @returns either all active screens or the input
	 */
	public getChosenScreens(input: string | string[], prefix = 'S'): string[] {
		if (typeof input === 'string') {
			input = [input]
		}
		input = this.expandScreenAuxTokens(input)
		let screens: string[] = []
		// get screens to check
		if (input.includes('all')) {
			this.getScreensArray().forEach((screen: Choicemeta) => screens.push(`${prefix}${screen.index}`))
		} else if (input.includes('sel')) {
			screens = [...input]
			screens.splice(screens.indexOf('sel'), 1)
			for (const selscr of this.getSelectedScreens()) {
				if (screens.includes(selscr) === false) {
					screens.push(selscr)
				}
			}
		} else {
			screens = input
		}
		return screens
	}

	/**
	 * Returns the input array of auxes but extends it by all active auxes or the selected auxes if the input array contains 'all' or 'sel'
	 * @param input array of strings to check
	 * @returns either all active auxes or the input
	 */
	public getChosenAuxes(input: string | string[]): string[] {
		if (typeof input === 'string') {
			input = [input]
		}
		input = this.expandScreenAuxTokens(input)
		let screens: string[] = []
		// get screens to check
		if (input.includes('all')) {
			this.getAuxArray().forEach((screen: Choicemeta) => screens.push('A' + screen.index))
		} else if (input.includes('sel')) {
			screens = [...input]
			screens.splice(screens.indexOf('sel'), 1)
			for (const selscr of this.getSelectedScreens()) {
				if (screens.includes(selscr) === false) {
					screens.push(selscr)
				}
			}
		} else {
			screens = input
		}
		return screens
	}

	public getAuxBackgroundChoices(): Dropdown<string>[] {
		return []
	}

	/**
	 * Returns the input array of screens and maybe auxes if on this platform they support screen memories but extends it by all active screens and auxes or the selected screens/auxes if the input array contains 'all' or 'sel'
	 * @param input array of strings to check
	 * @returns either all active screens or the input in prefix+number(S1 A2) format
	 */
	public getChosenScreensSupportedByScreenMemories = this.getChosenScreenAuxes

	/**
	 * Returns the input array of screens and auxes but extends it by all active screens and auxes or the selected screens/auxes if the input array contains 'all' or 'sel'
	 * @param input array of strings to check
	 * @returns either all active screens or the input in prefix+number(S1 A2) format
	 */
	public getChosenScreenAuxes(input: string | string[] | undefined): string[] {
		if (input === undefined) return []
		if (typeof input === 'string') {
			input = [input]
		}
		input = this.expandScreenAuxTokens(input)
		let screens: string[] = []
		// get screens to check
		if (input.includes('all')) {
			screens.push(...this.getChosenScreens('all'))
			screens.push(...this.getChosenAuxes('all'))

		} else if (input.includes('sel')) {
			screens = [...input]
			screens.splice(screens.indexOf('sel'), 1)
			for (const selscr of this.getSelectedScreens()) {
				if (screens.includes(selscr) === false) {
					screens.push(selscr)
				}
			}
		} else {
			screens = input
		}
		return screens
	}

	/** Returns selected screens always in LP format */
	public getSelectedScreens(): string[] {
		let path = 'LOCAL/screenAuxSelection/keys'
		if (this.instance.state.syncSelection) {
			path = 'REMOTE/live/screens/screenAuxSelection/keys'
		}
		return [...(this.state.get(path) ?? [])]
	}

	/** Returns selected layers always in LP format */
	public getSelectedLayers(): { screenAuxKey: string; layerKey: string} [] {
		let path = 'LOCAL/layerIds'
		if (this.instance.state.syncSelection) {
			path = 'REMOTE/live/screens/layerSelection/layerIds'
		}
		return this.state.get(path)
	}
	
    /**
	 * get MAC address for WOL
	 */
	public getMACaddress(): string {
		return this.state
			.get(this.constants.macAddressPath)
			.map((elem: number) => {
				return elem.toString(16).padStart(2,'0')
			})
			.join(':') ?? ''
	}

	/**
	 * get choices of linked devices
	 */
	getLinkedDevicesChoices(): Dropdown<number>[] {
		return [{id: 1, label: '1 (Leader 👑)'}]
	}

	/**
	 * get IP, MAC address, model name and firmware version of a linked Follower device (2-4), read from its
	 * own entry in device/system/deviceList/items - confirmed present in the same shape on all 4 slots
	 * against the Analog Way simulator (deviceKey 1 = Leader, 2-4 = Followers), same byte-array encoding as
	 * getMACaddress()/the config's ipv4 fields elsewhere. Returns empty strings if the link is currently
	 * inactive (isLinkActive false - e.g. a configured Follower temporarily unplugged/standalone) or has
	 * fewer Followers than the given deviceKey needs.
	 */
	public getLinkedDeviceInfo(deviceKey: number): {ip: string, mac: string, model: string, firmware: string} {
		const isLinkActive = this.state.get('LINK/isLinkActive') === true
		const followerCount: number = isLinkActive ? (this.state.get('LINK/followers')?.length ?? 0) : 0
		if (deviceKey - 1 > followerCount) return {ip: '', mac: '', model: '', firmware: ''}

		const macBytes = this.state.get(['DEVICE', 'device', 'system', 'deviceList', 'items', deviceKey.toString(), 'network', 'adapter', 'pp', 'macAddress'])
		const ipBytes = this.state.get(['DEVICE', 'device', 'system', 'deviceList', 'items', deviceKey.toString(), 'network', 'ipv4', 'pp', 'ip'])
		const dev: string = this.state.get(['DEVICE', 'device', 'system', 'deviceList', 'items', deviceKey.toString(), 'pp', 'dev']) ?? ''
		const firmware: string = this.state.get(['DEVICE', 'device', 'system', 'deviceList', 'items', deviceKey.toString(), 'version', 'pp', 'updater']) ?? ''

		const mac = Array.isArray(macBytes)
			? macBytes.map((elem: number) => elem.toString(16).padStart(2, '0')).join(':')
			: ''
		const ip = Array.isArray(ipBytes) ? ipBytes.join('.') : ''
		const model = this.deriveLinkedDeviceModelName(dev)

		return {ip, mac, model, firmware}
	}

	/**
	 * Maps a raw 'dev' identifier (e.g. 'NLC_RS6') to a human-readable model name, same prefixes/naming as
	 * the master-device detection in connection.ts's connect() - kept as a small separate lookup here since
	 * that one also drives platform routing/logging and isn't easily reused as-is. Falls back to the raw
	 * 'dev' string for an unrecognized prefix, so something informative is still shown either way.
	 */
	private deriveLinkedDeviceModelName(dev: string): string {
		if (!dev) return ''
		if (dev.substring(0, 3) === 'NLC') return formatAquilonModel(dev)
		if (dev.match(/^EIKOS/)) return 'Eikos 4k'
		if (dev.match(/^PULSE/)) return 'Pulse 4k'
		if (dev.match(/^QMX/)) return 'QuikMatrix 4k'
		if (dev.match(/^QVU/)) return 'QuickVu 4k'
		if (dev.match(/^ZEN100/)) return 'Zenith 100'
		if (dev.match(/^ZEN200/)) return 'Zenith 200'
		if (dev.match(/^DBG/)) return 'MNG_DEBUG'
		return dev
	}

	/** Known plug-type display-name overrides, for cases where the raw protocol value (e.g. 'DISPLAY_PORT')
	 * isn't already the desired display text. Extend as more card/connector types get confirmed live. */
	private static readonly PLUG_TYPE_NAMES: Record<string, string> = {
		DISPLAY_PORT: 'DisplayPort',
		OPTIC: 'HDMI Fiber',
	}

	private formatPlugType(type: string, count: number): string {
		// SDI's real variant depends on the port count, not the plugType string alone - confirmed live
		// (2026-09-05): a 4-port SDI card is 12G-SDI, an 8-port SDI card is 3G-SDI.
		if (type === 'SDI') return count >= 8 ? '3G-SDI' : '12G-SDI'
		return Choices.PLUG_TYPE_NAMES[type] ?? type
	}

	/** Known CARD-level display-name overrides, for cards whose individual ports report a generic plugType
	 * (e.g. an NDI/12G-SDI card's ports still report plain 'SDI') even though the card itself is something
	 * more specific - keyed by the slot's own 'attributes.febeCardType', takes priority over per-port
	 * plugTypes when present. Confirmed live (2026-09-05): 'FE_IP_SDI' is the Input-side NDI/12G-SDI card;
	 * an Output-side equivalent (if it exists) is an unconfirmed guess at the same 'BE_IP_SDI' naming pattern. */
	private static readonly FEBE_CARD_TYPE_NAMES: Record<string, string> = {
		FE_IP_SDI: 'NDI/12G-SDI',
		BE_IP_SDI: 'NDI/12G-SDI',
		// Only present in the last Output port - required for the system to be linkable at all (see the
		// Beta 6 "linked device" work elsewhere in this module).
		BE_EXT_QSFP: 'QSFP+ Link Card',
	}

	/**
	 * Builds a human-readable "Inputs: ...\nOutputs: ..." summary of a device's installed I/O cards, for
	 * direct display in the config (Device Model / Device N) - NOT sourced from the WebSocket-pushed DEVICE
	 * state tree at all. Confirmed live (2026-09-05) against the real WebRCS UI's own "Device Overview -
	 * Hardware" panel: the actual data comes from a separate REST call, GET /api/device/chassis/{deviceKey}
	 * (see connection.ts's fetchChassisInfo(), cached per device under LOCAL/chassis/{deviceKey}). Each
	 * physical card is one 'slots' entry keyed like 'SLOT_IN_3' (cardType IN/OUT, slot number from the key);
	 * two slots share one 'attributes.cardKey' per physical Input/Output panel (e.g. 'IN_1'), each holding
	 * one physical card. Port COUNT per connector type is NOT a plain number anywhere - it has to be derived
	 * by counting that slot's 'elements' entries (type 'PLUGS') whose 'plugTypes' array is non-empty; an
	 * empty/unplugged slot or a filler card (e.g. 'FE_CAP') has every element's plugTypes empty and is
	 * skipped entirely. Returns an empty string if there is no chassis data yet (not connected, or this
	 * device/deviceKey doesn't exist).
	 */
	public getInstalledCardsSummary(deviceKey: number): string {
		const slots = this.state.get(['LOCAL', 'chassis', deviceKey.toString(), 'slots'])
		if (!Array.isArray(slots)) return ''

		const describeSlot = (slot: any): {group: 'IN' | 'OUT', num: number, text: string} | null => {
			const cardType = slot?.attributes?.cardType
			if (cardType !== 'IN' && cardType !== 'OUT') return null
			const match = /^SLOT_(?:IN|OUT)_(\d+)$/.exec(slot?.key ?? '')
			if (!match) return null

			const num = parseInt(match[1], 10)
			const label = cardType === 'IN' ? 'Input' : 'Output'
			const febeCardType: string | undefined = slot?.attributes?.febeCardType

			// The QSFP+ Link Card isn't a normal video I/O card (no plugTypes of its own) - shown as its own
			// "Slot N: ..." line, without the usual "Input/Output-Card N" label or a port count, and checked
			// before the port-count/filler logic below since it would otherwise look like an empty/filler slot.
			if (febeCardType === 'BE_EXT_QSFP') {
				return {group: cardType, num, text: `Slot ${num}: ${Choices.FEBE_CARD_TYPE_NAMES.BE_EXT_QSFP}`}
			}

			const nonEmptyElements = (slot.elements ?? []).filter(
				(el: any) => el?.type === 'PLUGS' && (el?.attributes?.plugTypes ?? []).length > 0
			)
			const portCount = nonEmptyElements.length

			if (portCount === 0) {
				// No functional ports - either the slot is genuinely empty (febeCardType 'UNKNOWN', confirmed
				// live), or a filler/blanking card is physically present but provides nothing ('FE_CAP'/'BE_CAP',
				// confirmed live too - guessing "Filler Card" as the display name for that one, not yet
				// confirmed with Analog Way's own wording). A genuinely empty slot is still listed (as "Slot N:
				// empty/no card present", not "Card N:" since there's no card there at all) rather than silently
				// omitted; anything else with no ports gets listed with its raw type, so it's visible rather
				// than silently missing, and easy to correct once the real display name is known.
				if (!febeCardType || febeCardType === 'UNKNOWN') {
					return {group: cardType, num, text: `${label} Slot ${num}: empty/no card present`}
				}
				const filler = /_CAP$/.test(febeCardType) ? 'Filler Card' : `no ports (raw type: ${febeCardType})`
				return {group: cardType, num, text: `${label} Card ${num}: ${filler}`}
			}

			// A card-level override (e.g. NDI/12G-SDI) takes priority over the per-port plugTypes label, since
			// some cards report a generic plugType (plain 'SDI') on every port despite being something more
			// specific at the card level - confirmed live for 'FE_IP_SDI'.
			const cardOverride = febeCardType ? Choices.FEBE_CARD_TYPE_NAMES[febeCardType] : undefined
			if (cardOverride) {
				return {group: cardType, num, text: `${label} Card ${num}: ${cardOverride} (${portCount} Port${portCount === 1 ? '' : 's'})`}
			}

			const plugCounts: Record<string, number> = {}
			for (const el of nonEmptyElements) {
				for (const plugType of el.attributes.plugTypes) {
					plugCounts[plugType] = (plugCounts[plugType] ?? 0) + 1
				}
			}
			const parts = Object.entries(plugCounts).map(([plugType, count]) => `${this.formatPlugType(plugType, count)} (${count} Port${count === 1 ? '' : 's'})`)

			return {group: cardType, num, text: `${label} Card ${num}: ${parts.join(', ')}`}
		}

		const described = (slots as any[]).map(describeSlot).filter((s): s is NonNullable<typeof s> => s !== null)
		const byNum = (a: {num: number}, b: {num: number}): number => a.num - b.num
		const inputs = described.filter((s) => s.group === 'IN').sort(byNum).map((s) => s.text)
		const outputs = described.filter((s) => s.group === 'OUT').sort(byNum).map((s) => s.text)

		if (inputs.length === 0 && outputs.length === 0) return ''

		// Two-column Markdown table (Inputs | Outputs) - NOT confirmed live whether Companion's config
		// static-text actually renders Markdown tables; falls back to an empty cell for the shorter column.
		const rowCount = Math.max(inputs.length, outputs.length)
		const rows = Array.from({length: rowCount}, (_v, i) => `| ${inputs[i] ?? ''} | ${outputs[i] ?? ''} |`)
		return ['| Inputs | Outputs |', '| --- | --- |', ...rows].join('\n')
	}

	/**
	 * returns the path from preset to layer  
	 * depending on platform this will be layerList/items/layer or liveLayerlist/items/layer, background, top
	 * @param layerId can be a layer number, optionally with a prefix, or bkg/background/native/top
	 * @returns 
	 */
	getLayerPath(layerId: string | number): string[] {
		let layer: string
		if (typeof layerId === 'string') layer = layerId
		else layer = layerId.toString()

		if (layer.match(/top/i)) {
			return ['layerList', 'items', '48']
		}
		else if (layer.match(/^bg$|bkg|background|native/i)) {
			return ['layerList', 'items', 'NATIVE']
		}
		else {
			return ['layerList', 'items', layer.replace(/\D/g, '')]
		}
	}

}
