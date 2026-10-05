import { CompanionMigrationAction, FixupNumericOrVariablesValueToExpressions } from "@companion-module/base"

type LooseObj = {[name: string]: any}
const UpgradeScripts = [
	/*
	 * Place your upgrade scripts here
	 * Remember that once it has been added it cannot be removed!
	 */

	// Update the option types from numbers to strings to accommodate expressions, add values for anchor
	function updatePositionAndSizeActionV2_4(_context, props: LooseObj) {
        const actions = props.actions
		const actionsToUpdate:CompanionMigrationAction[] = []

		actions.filter((action: CompanionMigrationAction) => action.actionId === 'devicePositionSize').forEach((oldAction: CompanionMigrationAction) => {
			const action = {...oldAction, options: {...oldAction.options}}
			action.options.x = FixupNumericOrVariablesValueToExpressions(action.options.x) ?? { value: 0, isExpression: false }
			action.options.y = FixupNumericOrVariablesValueToExpressions(action.options.y) ?? { value: 0, isExpression: false }
			action.options.w = FixupNumericOrVariablesValueToExpressions(action.options.w) ?? { value: 1920, isExpression: false }
			action.options.h = FixupNumericOrVariablesValueToExpressions(action.options.h) ?? { value: 1080, isExpression: false }
			if (action.options.xAnchor === undefined) action.options.xAnchor = { value: 'lx + 0.5 * lw', isExpression: true }
			if (action.options.yAnchor === undefined) action.options.yAnchor = { value: 'ly + 0.5 * lh', isExpression: true }
			if (action.options.ar === undefined) action.options.ar = { value: '', isExpression: false }

			actionsToUpdate.push(action)
		})

        return {
            updatedConfig: null,
            updatedActions: actionsToUpdate,
            updatedFeedbacks: [],
        }
    },
	// Update the audio routing actions so they include the device option and add index to in/out
	function updateAudioRoutingV2_4(_context, props: LooseObj) {
		const actions = props.actions
		const actionsToUpdate:CompanionMigrationAction[] = []

		actions
			.filter((action: CompanionMigrationAction) => (
				(action.actionId === 'deviceAudioRouteBlock' || action.actionId === 'deviceAudioRouteChannels')
				&& action.options['device'] === undefined
			))
			.forEach((oldAction: CompanionMigrationAction) => {
				const action = {...oldAction, options: {...oldAction.options}}
				let device: number = typeof action.options.device?.value === 'number' ? action.options.device.value : 1
				if (typeof action.options.device?.value === 'string') device = parseInt(action.options.device.value)
				if (isNaN(device) || device < 1) device = 1
				action.options.device = { value: device, isExpression: false }

				const out = action.options.out?.value
				if (out !== undefined && action.options.out1 === undefined) action.options.out1 = { value: out, isExpression: false }
				if (out !== undefined && action.options.out2 === undefined) action.options.out2 = { value: out, isExpression: false }
				if (out !== undefined && action.options.out3 === undefined) action.options.out3 = { value: out, isExpression: false }
				if (out !== undefined && action.options.out4 === undefined) action.options.out4 = { value: out, isExpression: false }
				if (out !== undefined && action.options.out1 !== undefined) delete action.options.out
				const inp = action.options.in?.value
				if (inp !== undefined && action.options.in1 === undefined) action.options.in1 = { value: inp, isExpression: false }
				if (inp !== undefined && action.options.in2 === undefined) action.options.in2 = { value: inp, isExpression: false }
				if (inp !== undefined && action.options.in3 === undefined) action.options.in3 = { value: inp, isExpression: false }
				if (inp !== undefined && action.options.in4 === undefined) action.options.in4 = { value: inp, isExpression: false }
				if (inp !== undefined && action.options.in1 !== undefined) delete action.options.in

				actionsToUpdate.push(action)
			})

        return {
            updatedConfig: null,
            updatedActions: actionsToUpdate,
            updatedFeedbacks: [],
        }

	},
	// Update the power option "wake" from midra to be "on", so it is in line with LivePremier
	function updateMidraWakeV2_4(_context, props: LooseObj) {
		const actions = props.actions
		const actionsToUpdate:CompanionMigrationAction[] = []

		actions
			.filter((action: CompanionMigrationAction) => (action.actionId === 'devicePower' && action.options['action']?.value === 'wake'))
			.forEach((oldAction: CompanionMigrationAction) => {
				const action = {...oldAction, options: {...oldAction.options}}
				action.options.wake = { value: 'on', isExpression: false }

				actionsToUpdate.push(action)
			})

        return {
            updatedConfig: null,
            updatedActions: actionsToUpdate,
            updatedFeedbacks: [],
        }

	},
	// V3 renamed most dynamic variables to a clearer scheme (e.g. "SM1.label" instead of "screenMemory1label").
	// Any config that already existed before this change keeps using the old names, so existing button texts
	// and triggers referencing them by name keep working unchanged. Only brand new connections start on the new names.
	function useOldVariableNamesForExistingConfigs(_context, props: LooseObj) {
		let updatedConfig: LooseObj | null = null
		if (props.config && props.config.useOldVariableNames === undefined) {
			updatedConfig = { ...props.config, useOldVariableNames: true }
		}

		return {
			updatedConfig,
			updatedActions: [],
			updatedFeedbacks: [],
		}
	},
	// "Allow Live Thumbnails" defaults to true for everyone (new feature, nothing to preserve compatibility
	// with) - but parseBoolean(undefined) reads as false, so a config saved before this option existed would
	// silently come up as "off" instead of the intended default. Backfill it explicitly, same as above.
	function allowLiveThumbnailsDefaultForExistingConfigs(_context, props: LooseObj) {
		let updatedConfig: LooseObj | null = null
		if (props.config && props.config.allowLiveThumbnails === undefined) {
			updatedConfig = { ...props.config, allowLiveThumbnails: true }
		}

		return {
			updatedConfig,
			updatedActions: [],
			updatedFeedbacks: [],
		}
	},
	// "LIVE - Source Tally"'s "Screens / Auxscreens" field used to be a Companion-native multi-select
	// (`multiple: true`, storing an array like ['S1', 'S2']) - switched to this module's usual single-value
	// dropdown + concatenated Expression Mode string ('S1S2', matching the 'S1S2A1' convention every other
	// "Screens" field already uses), per explicit user decision (2026-09-08): consistency across the module
	// matters more than this one field's native-multi-select convenience. The old array's own choices only
	// ever produced 'all' or literal Screen/Aux ids (never 'sel'/'first', which didn't exist on the old
	// field) - an empty array or one containing 'all' becomes 'all' (its old meaning, "Any Screen"), anything
	// else is joined with no separator into a single concatenated string.
	// Never matched anything: base 2.x wraps options as { value, isExpression }, so the Array.isArray test
	// below is always false. Superseded by migrateV2OptionValuesToV3Choices, which does this conversion.
	function updateSourceTallyScreensToExpressionSyntax(_context, props: LooseObj) {
		const feedbacks = props.feedbacks
		const feedbacksToUpdate: LooseObj[] = []

		feedbacks
			.filter((feedback: LooseObj) => feedback.feedbackId === 'deviceSourceTally' && Array.isArray(feedback.options.screens))
			.forEach((oldFeedback: LooseObj) => {
				const feedback = { ...oldFeedback, options: { ...oldFeedback.options } }
				const arr: string[] = feedback.options.screens
				feedback.options.screens = (arr.length === 0 || arr.includes('all')) ? 'all' : arr.join('')
				feedbacksToUpdate.push(feedback)
			})

		return {
			updatedConfig: null,
			updatedActions: [],
			updatedFeedbacks: feedbacksToUpdate,
		}
	},
	// Rewrites option values a V2 config stored but V3's dropdowns no longer list, so they show as their proper
	// choice instead of as an invalid value. Since @companion-module/base 2.x, `allowInvalidValues` only relaxes
	// validation in expression mode - a plain dropdown holding a value outside its choices is flagged invalid
	// regardless, which is what an upgraded V2 config showed for Preview ('pvw') in "Recall Screen Memory".
	//
	// This is cosmetic for the module itself: every value converted here is still accepted at runtime, and must
	// stay accepted - 'pvw' in particular is a documented alternative to 'prw' (getPresetSelection(), getPreset()
	// and every preset switch take both), and expressions are deliberately left untouched for that reason. Only
	// values whose V3 equivalent behaves identically are rewritten; anything else is left as it was, since the
	// runtime still runs it correctly and a guessed conversion could change what a button does.
	//
	// Also covers the Source Tally screens conversion above: that script tests the raw option for an array, but
	// base 2.x hands options to upgrade scripts wrapped as { value, isExpression }, so it never matched anything.
	// It stays in place (upgrade scripts are tracked by position and must never be removed); this one is
	// idempotent and does the work.
	function migrateV2OptionValuesToV3Choices(_context, props: LooseObj) {
		// Reads and writes an option's plain value, tolerating both the wrapped and the bare shape. Expressions
		// are reported as undefined, so nothing below ever touches one.
		const getValue = (options: LooseObj, key: string): any => {
			const opt = options[key]
			if (opt !== null && typeof opt === 'object' && !Array.isArray(opt) && 'isExpression' in opt) {
				return opt.isExpression ? undefined : opt.value
			}
			return opt
		}
		const setValue = (options: LooseObj, key: string, value: any): void => {
			const opt = options[key]
			options[key] = opt !== null && typeof opt === 'object' && !Array.isArray(opt) && 'isExpression' in opt
				? { value, isExpression: false }
				: value
		}

		// V2 "Screens" multi-selects that are single dropdowns in V3, with the 'S1S2A1' concatenation convention.
		// Only lists that convert without changing their meaning: a single entry, 'all', or plain Screen/Aux ids.
		// A mix of 'sel' and explicit ids has no single-string equivalent ('selS1' would drop the 'sel'), and an
		// empty list did nothing in V2 - both are left as arrays, which V3 still executes exactly as before.
		const screensToString = (arr: string[]): string | undefined => {
			if (arr.length === 0) return undefined
			if (arr.includes('all')) return 'all'
			if (arr.length === 1) return arr[0]
			if (arr.every((id) => /^[SA]\d+$/.test(id))) return arr.join('')
			return undefined
		}
		const screensActions = ['deviceAuxMemory', 'deviceCopyProgram', 'deviceCutScreen', 'deviceScreenMemory', 'deviceTakeScreen', 'deviceTakeTime', 'deviceTbar', 'lockScreen']
		// Fields whose V3 choices use the short input id 'IN{n}', where V2 stored the raw one: 'IN_{n}' on
		// LivePremier, 'INPUT_{n}' on Midra/Alta.
		const shortInputActions = ['deviceInputFreeze', 'deviceInputKeying']
		const toShortInput = (v: any): any => (typeof v === 'string' && /^(?:IN|INPUT|LIVE)_\d+$/.test(v) ? `IN${v.replace(/\D/g, '')}` : v)

		const migrate = (id: string, isFeedback: boolean, options: LooseObj): boolean => {
			let changed = false
			const update = (key: string, fn: (v: any) => any): void => {
				if (!(key in options)) return
				const before = getValue(options, key)
				if (before === undefined) return
				const after = fn(before)
				if (after === undefined || JSON.stringify(after) === JSON.stringify(before)) return
				setValue(options, key, after)
				changed = true
			}

			// Preview was 'pvw' in V2 and is 'prw' in V3, in every "Preset (Program/Preview)" field.
			update('preset', (v) => (v === 'pvw' ? 'prw' : v))
			if (!isFeedback && id === 'selectPreset') update('mode', (v) => (v === 'pvw' ? 'prw' : v))

			if (!isFeedback && screensActions.includes(id)) update('screens', (v) => (Array.isArray(v) ? screensToString(v) : v))
			if (!isFeedback && shortInputActions.includes(id)) update('input', toShortInput)
			if (isFeedback && id === 'deviceInputFreeze') update('input', toShortInput)

			// The Background Layer is 'BG' in V3's shared layer list. The deprecated V2 actions keep their own
			// frozen list with 'NATIVE' and are deliberately not touched; this feedback uses the shared one.
			if (isFeedback && id === 'remoteLayerSelection') update('layer', (v) => (v === 'NATIVE' ? 'BG' : v))

			// Layer numbers were stored as numbers in V2 and are strings in V3.
			if (!isFeedback && id === 'devicePositionSize') update('layersel', (v) => (typeof v === 'number' ? v.toString() : v))

			// Midra/Alta layer and aux sources moved to the short ids 'IN{n}'. LivePremier still lists its raw
			// 'LIVE_{n}' / 'STILL_{n}' here, so only Midra's 'INPUT_{n}' is converted.
			if (!isFeedback && id === 'deviceSelectSource') {
				const midraInput = (v: any): any => (typeof v === 'string' && /^INPUT_\d+$/.test(v) ? `IN${v.replace(/\D/g, '')}` : v)
				update('sourceLayer', midraInput)
				update('sourceBack', midraInput)
			}

			if (isFeedback && id === 'deviceSourceTally') {
				// V2's multi-select only ever offered 'all' and Screen/Aux ids; empty meant "any Screen".
				update('screens', (v) => (Array.isArray(v) ? (v.length === 0 || v.includes('all') ? 'all' : v.join('')) : v))
				update('source', (v) => {
					if (typeof v !== 'string') return v
					if (/^(?:LIVE|INPUT)_\d+$/.test(v)) return `IN${v.replace(/\D/g, '')}`
					if (/^STILL_\d+$/.test(v)) return `IMG${v.replace(/\D/g, '')}`
					return v
				})
			}
			return changed
		}

		const updatedActions: LooseObj[] = []
		for (const oldAction of props.actions ?? []) {
			const action = { ...oldAction, options: { ...oldAction.options } }
			if (migrate(action.actionId, false, action.options)) updatedActions.push(action)
		}
		const updatedFeedbacks: LooseObj[] = []
		for (const oldFeedback of props.feedbacks ?? []) {
			const feedback = { ...oldFeedback, options: { ...oldFeedback.options } }
			if (migrate(feedback.feedbackId, true, feedback.options)) updatedFeedbacks.push(feedback)
		}

		return {
			updatedConfig: null,
			updatedActions,
			updatedFeedbacks,
		}
	},
]

export { UpgradeScripts }
