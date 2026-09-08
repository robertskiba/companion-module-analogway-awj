import { combineRgb, JsonObject, SomeCompanionConfigField } from '@companion-module/base'
import { compareFirmwareVersions } from './util.js'

export interface Config extends JsonObject {
	deviceaddr: string
	foundDevices: string
	secureHttp: boolean
	simulatedDevice: boolean
	macaddress: string
	deviceModel: string
	deviceFirmware: string
	device2ip: string
	device2mac: string
	device2model: string
	device2firmware: string
	device3ip: string
	device3mac: string
	device3model: string
	device3firmware: string
	device4ip: string
	device4mac: string
	device4model: string
	device4firmware: string
	sync: boolean
	showDisabled: boolean
	showNotExisting: boolean
	color_bright: number
	color_dark: number
	color_highlight: number
	color_green: number
	color_greendark: number
	color_greengrey: number
	color_red: number
	color_reddark: number
	color_redgrey: number
	useOldVariableNames: boolean
	allowLiveThumbnails: boolean
	hotBackupEnabled: boolean
	hotBackupAddress: string
	hotBackupAutoFailover: boolean
	hotBackupFailoverTimeout: number
}

export interface FoundDevice {
	address: string
	port: number
	model: string
}

export interface DeviceCardSummaries {
	leader?: string
	device2?: string
	device3?: string
	device4?: string
}

/** A standalone "Installed Cards" field/row showing the Inputs/Outputs card summary, shown directly under a
 * device's own info line - omitted entirely if there's no summary yet (not connected, or this device
 * doesn't exist). Visible text, not a tooltip: Companion's config static-text does not appear to show a
 * tooltip icon at all (confirmed live - it never appeared regardless of content), so anything worth knowing
 * has to be in the field's own visible value instead. */
function installedCardsField(id: string, summary?: string): SomeCompanionConfigField[] {
	if (!summary) return []
	return [{
		id,
		type: 'static-text' as const,
		label: 'Installed Cards',
		value: summary,
		width: 12,
	}]
}

// Analog Way's currently recommended firmware baseline - devices below this get an "Update Suggested" hint.
// Update this constant when a newer recommended version is confirmed. Also used by choices.ts's
// isFirmwareAtLeast() as the optimistic assumption before any real device has connected - keep it ahead of
// every firmware gate actually in use, or offline pre-programming could start assuming a gated feature isn't
// available when it actually would be once connected.
export const RECOMMENDED_FIRMWARE = '6.2.73'

function isFirmwareBelow(version: string, threshold: string): boolean {
	return compareFirmwareVersions(version, threshold) < 0
}

// Below V4, the AWJ protocol itself changed (not just additions), and this module no longer supports it at
// all (the dedicated pre-V4 implementation was removed - too much duplicate maintenance for a case that in
// practice only affects fixed installs nobody has touched in years, since every Aquilon can be updated to V4+
// regardless of hardware generation). AWJconnection refuses the connection outright for such a device and
// logs FIRMWARE_TOO_OLD_TEXT as the error; this same text doubles as the config page's explanation for
// existing configs that still remember a pre-V4 firmware from before this change (see updateSuggestedField()).
const UPDATE_PATH_HINT =
	'Please read the update instructions of the new Livepremier firmware and follow the update path recommendations for your firmware'
const UPDATE_SUGGESTED_TEXT_V4_PLUS =
	`It is strongly recommended to update your firmware to the most current firmware version V6 or above. If your device is also controlled by other control devices (e.g. Crestron, AMX, Extron, Q-Sys or similar), it will still work since there were no changes (only additions) of the communications protocol. ${UPDATE_PATH_HINT}`
// A device on 6.0.4+ is already close to current - the update to the latest stable release is low-risk (no
// protocol changes, no config migration) rather than a "you're behind" warning, so this gets reassuring
// wording instead of UPDATE_SUGGESTED_TEXT_V4_PLUS's more general one.
const UPDATE_SUGGESTED_TEXT_NEAR_CURRENT =
	`Your firmware is already nearly recent. As of this module's release, the current stable, reliable version is at least V${RECOMMENDED_FIRMWARE} (a newer one may exist by now if this module hasn't been updated recently) - updating to it from here is low-risk: no communications protocol changes and no unwanted changes to your existing setup are expected. There is no update path to follow at this point - please read the update instructions of the new Livepremier firmware and update your firmware.`
export const FIRMWARE_TOO_OLD_TEXT =
	`This module no longer supports Livepremier/Aquilon firmware below V4 - the connection was refused. The AWJ communications protocol changed with V4, and this module's dedicated support for the older protocol has been discontinued. Please update the device firmware to V4 or above (V6+ recommended); if the device is also controlled by other control devices (e.g. Crestron, AMX, Extron, Q-Sys or similar), please FIRST ASK THE SYSTEM INTEGRATOR before updating. If updating isn't an option, use an older release of this module instead. ${UPDATE_PATH_HINT}`

/** Plain "Firmware x.x.xx" - Companion's config static-text does not render HTML/color styling (confirmed
 * live: a <span style="color:..."> got stripped down to plain text), so any "outdated" emphasis is handled
 * as a separate, own "Update Suggested" field instead (see updateSuggestedField() below), not inline here. */
function firmwareLabel(fw: string): string {
	return `Firmware ${fw}`
}

/** A standalone "Update Suggested"/"Not Supported" field/row, shown directly under a device's own info line
 * (for the Leader, this ends up above "Device Network Address" - see its call site below) only when its
 * firmware is below RECOMMENDED_FIRMWARE - omitted entirely otherwise. No tooltip; the explanation is the
 * field's plain visible text itself, and has three tiers: below V4 (no longer supported at all - see
 * FIRMWARE_TOO_OLD_TEXT above), V4 up to 6.0.4 (protocol-compatible with third-party control, general "please
 * update" wording), and 6.0.4+ (already close to current - reassuring "safe, low-risk update" wording
 * instead, since there's nothing left to warn about other than not being on the very latest build). For the
 * below-V4 case, AWJconnection persists config.deviceFirmware even though it refuses the connection (see its
 * Aquilon branch), specifically so this notice reliably shows up here instead of only in the connection log. */
function updateSuggestedField(id: string, firmware?: string): SomeCompanionConfigField[] {
	if (!firmware || !isFirmwareBelow(firmware, RECOMMENDED_FIRMWARE)) return []
	const major = parseInt(firmware.split('.')[0], 10)
	if (isNaN(major)) return []
	const value = major < 4
		? FIRMWARE_TOO_OLD_TEXT
		: compareFirmwareVersions(firmware, '6.0.4') >= 0
			? UPDATE_SUGGESTED_TEXT_NEAR_CURRENT
			: UPDATE_SUGGESTED_TEXT_V4_PLUS
	return [{
		id,
		type: 'static-text' as const,
		label: major < 4 ? 'This Firmware Is Not Supported Any More' : 'Update Suggested',
		value,
		width: 12,
	}]
}

export function GetConfigFields(config?: Config, cardSummaries?: DeviceCardSummaries, networkScanResults?: FoundDevice[]): SomeCompanionConfigField[] {
	// Each detected Follower (2-4) gets exactly one summary line - "IP (MAC, Model, Firmware)" - and is
	// omitted entirely (not shown as an empty/placeholder row) if that Follower isn't currently detected.
	// An outdated Follower additionally gets its own "Update Suggested" line, and its installed cards their
	// own "Installed Cards" line, right below.
	const linkedDeviceFields: SomeCompanionConfigField[] = ([2, 3, 4] as const)
		.filter((n) => !!config?.[`device${n}ip` as const])
		.flatMap((n) => {
			const firmware = config?.[`device${n}firmware` as const]
			return [
				{
					id: `device${n}info`,
					type: 'static-text' as const,
					label: `Device ${n}`,
					value: `${config?.[`device${n}ip` as const]} (${config?.[`device${n}mac` as const] || 'unknown MAC'}, ${config?.[`device${n}model` as const] || 'unknown Model'}${firmware ? `, ${firmwareLabel(firmware)}` : ''})`,
					width: 12,
				},
				...installedCardsField(`device${n}cards`, cardSummaries?.[`device${n}` as const]),
				...updateSuggestedField(`device${n}updateSuggested`, firmware),
			]
		})

	return [
		// The Leader's own "Update Suggested" notice (if applicable) sits above everything else, including
		// Device Network Address - it's the one thing here worth seeing immediately, unlike the rest of this
		// section which is purely informational and lives at the bottom instead.
		...updateSuggestedField('deviceModelUpdateSuggested', config?.deviceFirmware),
		// Shown as soon as a scan has actually completed at least once (networkScanResults !== undefined) -
		// even with zero results, so "No Device Found" is a visible outcome, not just a log line the user
		// might miss. Stays hidden only before any scan has ever run.
		...(networkScanResults !== undefined ? [{
			id: 'foundDevices',
			type: 'dropdown' as const,
			label: 'Found AWJ Devices',
			tooltip:
				'Filled in automatically after a failed connection attempt triggers a one-time scan of the local network(s) for anything that looks like an AWJ device (real or simulated). Pick an entry to use it as the Device Network Address below.',
			choices: networkScanResults.length > 0
				? [
					{ id: '', label: 'Select a found device...' },
					...networkScanResults.map((d) => ({ id: `${d.address}:${d.port}`, label: `${d.address}:${d.port} (${d.model})` })),
				]
				: [{ id: '', label: 'No Device Found' }],
			default: '',
			width: 12,
		}] : []),
		{
			id: 'deviceaddr',
			type: 'textinput',
			label: 'Device Network Address',
			tooltip:
				'Enter the address of the device either as hostname or an IPv4 or IPv6 address with optional port number and optional credentials. If this is a linkable system (e.g. Aquilon), enter the address of the Leader device - the up to 3 Follower devices are detected automatically and shown below. Left empty on a freshly-added connection on purpose, so the automatic network scan runs right away - see "Found AWJ Devices" below.',
			width: 12,
			default: '',
		},
		{
			id: 'secureHttp',
			type: 'checkbox',
			label: 'Connect via Secure HTTP/HTTPS?',
			tooltip:
				'Check this to connect via https:// instead of http://. The address above is then automatically switched to https:// and its port corrected to 443 (shown explicitly, since this can differ in exceptional setups - edit it by hand afterwards if yours does).',
			default: false,
			width: 12,
		},
		{
			id: 'simulatedDevice',
			type: 'checkbox',
			label: 'Simulated Device?',
			tooltip:
				'Check this if the address above points to an Analog Way simulator, not a real device. Unless Secure HTTP is also checked above (a simulator\'s HTTPS also runs on 443, same as a real device), the address\'s port is then automatically corrected to the simulator\'s plain-HTTP default (3000) if it isn\'t already. This is also kept in sync automatically once connected: it switches itself on if a live check confirms the connected device actually is a simulator (e.g. after picking one from "Found AWJ Devices"), and off again if it\'s a real device.',
			default: false,
			width: 12,
		},
		{
			id: 'macaddress',
			type: 'textinput',
			label: 'Device MAC Address',
			tooltip: 'Will be automatically filled with the MAC of the last connected Device',
			regex: '/^$|^([0-9a-fA-F]{2}[,:_.\\s-]){5}[0-9a-fA-F]{2}$/',
			default: '',
			width: 12,
		},
		{
			id: 'sync',
			type: 'checkbox',
			label: 'Turn sync selection on after connection established',
			default: true,
			width: 12,
		},
		{
			id: 'showDisabled',
			type: 'checkbox',
			label: 'Show also disabled inputs in dropdowns',
			tooltip: 'Includes inputs that exist on the device but are currently administratively disabled - not inputs the device does not physically have at all (see "Show also not existing..." below for those).',
			default: false,
			width: 12,
		},
		{
			id: 'showNotExisting',
			type: 'checkbox',
			label: 'Show also not existing inputs, outputs and image slots in dropdowns',
			tooltip: 'Meant for pre-programming: lists every input/output/image slot up to the maximum any AWJ device of this type could ever have, regardless of whether the currently connected device actually has that many - so buttons can be prepared ahead of connecting a larger/differently equipped device.',
			default: false,
			width: 12,
		},
		{
			id: 'useOldVariableNames',
			type: 'checkbox',
			label: 'Use old (V2) variable names',
			tooltip:
				'V3 renamed most dynamic variables to a clearer, consistent scheme (e.g. "SM1.label" instead of "screenMemory1label"). Enable this to keep using the old V2 names if you already reference them in button texts or triggers. New connections start with this off.',
			default: false,
			width: 12,
		},
		{
			id: 'allowLiveThumbnails',
			type: 'checkbox',
			label: 'Allow Live Thumbnails',
			tooltip:
				'Enables the "Show Thumbnail" feedback to poll the device for live preview images. Turn off to stop all thumbnail polling instantly (e.g. on lower-power Companion hardware, or if many thumbnails are causing too much load) without having to remove every "Show Thumbnail" feedback individually.',
			default: true,
			width: 12,
		},
		{
			id: 'coltext',
			type: 'static-text',
			label: 'Colors',
			value: 'The colors are used as default colors for presets, actions and feedbacks',
			width: 12,
		},
		{
			id: 'color_bright',
			type: 'colorpicker',
			label: 'Bright',
			default: combineRgb(255, 255, 255),
			width: 4,
		},
		{
			id: 'color_dark',
			type: 'colorpicker',
			label: 'Dark',
			default: combineRgb(34, 42, 49),
			width: 4,
		},
		{
			id: 'color_highlight',
			type: 'colorpicker',
			label: 'Highlight',
			default: combineRgb(33, 133, 208),
			width: 4,
		},
		{
			id: 'color_green',
			type: 'colorpicker',
			label: 'Green',
			default: combineRgb(0, 220, 19),
			width: 4,
		},
		{
			id: 'color_greendark',
			type: 'colorpicker',
			label: 'Green-dark',
			default: combineRgb(0, 160, 11),
			width: 4,
		},
		{
			id: 'color_greengrey',
			type: 'colorpicker',
			label: 'Green-grey',
			default: combineRgb(70, 85, 72),
			width: 4,
		},
		{
			id: 'color_red',
			type: 'colorpicker',
			label: 'Red',
			default: combineRgb(255, 87, 22),
			width: 4,
		},
		{
			id: 'color_reddark',
			type: 'colorpicker',
			label: 'Red-dark',
			default: combineRgb(216, 0, 0),
			width: 4,
		},
		{
			id: 'color_redgrey',
			type: 'colorpicker',
			label: 'Red-grey',
			default: combineRgb(85, 70, 70),
			width: 4,
		},
		// Informational-only fields (Device Model, Installed Cards, Linked Devices) live down here, after
		// everything actually configurable, purely for clarity - the user never edits these.
		{
			id: 'deviceModel',
			type: 'static-text',
			label: 'Device Model',
			value: config?.deviceModel
				? `${config.deviceModel}${config.deviceFirmware ? ` (${firmwareLabel(config.deviceFirmware)})` : ''}`
				: 'not yet detected',
			width: 12,
		},
		...installedCardsField('deviceModelCards', cardSummaries?.leader),
		{
			id: 'hotBackupEnabled',
			type: 'checkbox',
			label: 'Enable Hot Backup Device',
			tooltip:
				'Mirrors a curated set of "safe" recall/transition actions (e.g. Recall Screen/Master/Aux/Multiviewer Memory, Take/Cut, Preset selection) to a second device as they\'re sent to the main one - its responses are ignored, this is one-way only. You are responsible for keeping the two devices\' saved memory content identical yourself (e.g. save a backup on the main device shortly before the show and load it onto this one) - only the recall/selection itself is mirrored, never what a memory slot actually contains. Use the "Device - Failover to Hot Backup" action to swap the two devices\' roles at any time.',
			default: false,
			width: 12,
		},
		...(config?.hotBackupEnabled ? [{
			id: 'hotBackupAddress',
			type: 'textinput' as const,
			label: 'Hot Backup Device Address',
			tooltip:
				'Plain manual entry only - unlike Device Network Address above, no automatic scanning, protocol/port correction, or simulator detection is applied here.',
			default: 'http://192.168.2.141',
			width: 12,
		}] : []),
		...(config?.hotBackupEnabled ? [{
			id: 'hotBackupAutoFailover',
			type: 'checkbox' as const,
			label: 'Enable Automatic Failover',
			tooltip:
				'Off by default - a manual "Device - Failover to Hot Backup" action always works regardless of this setting. If enabled, the module fails over on its own once the main device has been unreachable for longer than the timeout below, without waiting for the manual action. Consider carefully before enabling this for a live show: a brief network hiccup (not a real device failure) could trigger an unwanted failover on its own.',
			default: false,
			width: 12,
		}] : []),
		...(config?.hotBackupEnabled && config?.hotBackupAutoFailover ? [{
			id: 'hotBackupFailoverTimeout',
			type: 'number' as const,
			label: 'Automatic Failover Timeout (seconds)',
			tooltip: 'How long the main device must stay unreachable before the module automatically fails over to the Hot Backup Device.',
			default: 20,
			min: 3,
			max: 300,
			width: 12,
		}] : []),
		{
			id: 'linkedDevicesText',
			type: 'static-text',
			label: 'Linked Devices',
			value: 'On a linked system, every additional linked Follower device (2-4) is detected automatically once connected and shown below as "IP (MAC, Model)" - used for Wake on LAN alongside the Leader\'s own MAC address above. Nothing is shown here if this device isn\'t the leader of a linked system.',
			width: 12,
		},
		...linkedDeviceFields,
	]
}
