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
			name: 'Selected Preset (Program/Preview)',
		},
		{
			variableId: 'SelectedLayer.x',
			name: 'X position of the first selected layer (Ctrl-click order in WebRCS, not layer number order)',
		},
		{
			variableId: 'SelectedLayer.y',
			name: 'Y position of the first selected layer (Ctrl-click order in WebRCS, not layer number order)',
		},
		{
			variableId: 'SelectedLayer.width',
			name: 'Width of the first selected layer (Ctrl-click order in WebRCS, not layer number order)',
		},
		{
			variableId: 'SelectedLayer.height',
			name: 'Height of the first selected layer (Ctrl-click order in WebRCS, not layer number order)',
		},
		{
			variableId: 'SelectedLayer.number',
			name: 'Layer number of the first selected layer (blank if none selected or the background layer is selected)',
		},
		{
			variableId: 'SelectedLayer.count',
			name: 'Number of currently selected layers - check this before relying on SelectedLayer.x/.y/.width/.height/.number/.Input.*, which always describe only the first (Ctrl-clicked first) of a multi-selection',
		},
		{
			variableId: 'SelectedScreen.number',
			name: 'Screen/Aux id of the first selected screen (e.g. S1, A2) - blank if none selected. If several screens are selected (common in daily use), this and SelectedScreen.numberOfLayers only ever describe that first one',
		},
		{
			variableId: 'SelectedScreen.numberOfLayers',
			name: 'Number of (non-background) layers on the first selected screen',
		},
		{
			variableId: 'SelectedLayer.Input.Number',
			name: 'Number of the input or Image Store slot assigned to the first selected layer (blank if none)',
		},
		{
			variableId: 'SelectedLayer.Input.Name',
			name: 'Label of the input or still image assigned to the first selected layer ("none" if unused)',
		},
		{
			variableId: 'SelectedLayer.Input.width',
			name: 'Native resolution width of the source assigned to the first selected layer',
		},
		{
			variableId: 'SelectedLayer.Input.height',
			name: 'Native resolution height of the source assigned to the first selected layer',
		},
		{
			variableId: 'SelectedLayer.opacity',
			name: 'Opacity (raw 0-256 device value) of the first selected layer',
		},
		{
			variableId: 'SelectedLayer.Crop.Top',
			name: 'Classic crop Top of the first selected layer, in pixels of the source\'s native resolution - blank if the source\'s resolution is unknown',
		},
		{
			variableId: 'SelectedLayer.Crop.Bottom',
			name: 'Classic crop Bottom of the first selected layer, in pixels of the source\'s native resolution - blank if the source\'s resolution is unknown',
		},
		{
			variableId: 'SelectedLayer.Crop.Left',
			name: 'Classic crop Left of the first selected layer, in pixels of the source\'s native resolution - blank if the source\'s resolution is unknown',
		},
		{
			variableId: 'SelectedLayer.Crop.Right',
			name: 'Classic crop Right of the first selected layer, in pixels of the source\'s native resolution - blank if the source\'s resolution is unknown',
		},
		{
			variableId: 'SelectedLayer.Mask.Top',
			name: 'Mask Top of the first selected layer, in pixels of the layer\'s current on-screen size',
		},
		{
			variableId: 'SelectedLayer.Mask.Bottom',
			name: 'Mask Bottom of the first selected layer, in pixels of the layer\'s current on-screen size',
		},
		{
			variableId: 'SelectedLayer.Mask.Left',
			name: 'Mask Left of the first selected layer, in pixels of the layer\'s current on-screen size',
		},
		{
			variableId: 'SelectedLayer.Mask.Right',
			name: 'Mask Right of the first selected layer, in pixels of the layer\'s current on-screen size',
		},
		{
			variableId: 'SelectedScreen.tbarPosition',
			name: 'T-Bar position (0-100, matching "Set T-Bar Position"\'s Position field at its default Maximum of 100) of the first selected screen/aux',
		},
		{
			variableId: 'SelectedScreen.TransitionTime.Pgm',
			name: 'Transition time in seconds for the side currently on Program, for the first selected screen/aux',
		},
		{
			variableId: 'SelectedScreen.TransitionTime.Pvw',
			name: 'Transition time in seconds for the side currently on Preview, for the first selected screen/aux',
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
