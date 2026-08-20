import { CompanionMigrationAction, FixupNumericOrVariablesValueToExpressions } from "@companion-module/base"

type LooseObj = {[name: string]: any}
const UpgradeScripts = [
	/*
	 * Place your upgrade scripts here
	 * Remember that once it has been added it cannot be removed!
	 */

	// Update the option types from numbers to strings to accomodate expressions, add values for anchor
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
	// Update the power option "wake" from midra to be "on", so it is inline with livepremier
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
]

export { UpgradeScripts }
