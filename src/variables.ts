import {AWJinstance} from './index.js'

export interface TrackedVariable {
	/** internal id of the source adding this variable, not exposed to the user */
	id?: string
	/** unique to the instance id of the variable with which the user can reference it */
	variableId: string
	/** human readable description of the variable's content */
	name: string
}

export function initVariables(_instance: AWJinstance): TrackedVariable[] {
	const variables: TrackedVariable[] = [
		{
			variableId: 'connectionLabel',
			name: 'The label of this connection',
		},
		{
			variableId: 'selectedPreset',
			name: 'Selected Preset',
		},
	]

	// for (const input of getLiveInputChoices(instance.state)) {
	// 	variables.push({
	// 		label: 'Freeze state of input ' + input.label,
	// 		name: 'frozen_IN_' + input.id.replace('LIVE_', ''),
	// 	})
	// }

	return variables
}
