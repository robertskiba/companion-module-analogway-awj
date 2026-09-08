/**
 * Process a string with a time
 * @param timestring string containing the time, can be format like 1:23:45 or 01:23:45 or 12:34 or 5:05..., can be negative like -5:50
 * @returns numbers of seconds, e.g. 1234 or -42
 */
export const timeToSeconds = (timestring: string): number => {
	let hours = 0
	let minutes = 0
	let seconds = 0
	let direction = 1
	let result = timestring.match(/(?:^|\D)(-?)(\d|1\d|2[0-3])\D(\d|[0-5]\d)\D(\d|[0-5]\d)(?:\D|$)/)
	if (result) {
		direction = result[1] === '-' ? -1 : 1
		hours = parseInt(result[2])
		minutes = parseInt(result[3])
		seconds = parseInt(result[4])
		return (hours * 3600 + minutes * 60 + seconds) * direction
	}
	result = timestring.match(/(?:^|\D)(-?)(\d{0,3})\D(\d|[0-5]\d)(?:\D|$)/)
	if (result) {
		direction = result[1] === '-' ? -1 : 1
		minutes = parseInt(result[2])
		seconds = parseInt(result[3])
		return (hours * 3600 + minutes * 60 + seconds) * direction
	}
	result = timestring.match(/(?:^|\D)(-?)(\d{0,5})(?:\D|$)/)
	if (result) {
		direction = result[1] === '-' ? -1 : 1
		seconds = parseInt(result[2])
		return (hours * 3600 + minutes * 60 + seconds) * direction
	}
	return 0
}

/**
 * Coerces an option value that is nominally a boolean (a checkbox field) but, when driven by an
 * expression (e.g. a page variable), may actually arrive as a string like "false" or "0" instead of a
 * real boolean - and JavaScript's own truthiness would treat the non-empty string "false" as true.
 * Treats false/"false"/0/"0"/""/undefined/null (case-insensitively for strings) as false, everything
 * else (true/"true"/1/"1"/any other value) as true.
 */
export const parseBoolean = (value: unknown): boolean => {
	if (typeof value === 'string') value = value.toLowerCase()
	return !([false, 'false', 0, '0', '', undefined, null] as unknown[]).includes(value)
}

/**
 * Strips this module's own short-id prefix (e.g. 'SM'/'MM'/'LM'/'AM'/'MV' for the various Memory types)
 * from an option value driven by an expression/local variable, case-insensitively - e.g. 'SM10'/'sm10' -> '10'.
 * A value already bare (typed via the dropdown itself, which only ever stores the raw number) passes
 * through unchanged. Needed anywhere an option's raw value gets compared against or sent as the device's
 * own bare-number id, since the dropdown's own choice labels show the prefixed form but its underlying
 * value never carries it - only an expression-entered value can.
 */
export const stripMemoryPrefix = (value: unknown, prefix: string): string => {
	return (value ?? '').toString().replace(new RegExp(`^${prefix}`, 'i'), '')
}

/**
 * process times
 * @param time as number of deciseconds
 * @returns timestring in format SECONDS.D, e.g. "1.5" - matches the "Set Transition Time" action's own seconds field (0.1 step), so a read value can be fed straight back into it
 */
export const deciSecondsToString = (time: number): string => {
	return (time / 10).toFixed(1)
}

/**
 * Maps a raw Aquilon 'dev' suffix (e.g. 'RS6', 'CPLUS') to Analog Way's actual display spelling for that
 * model - most (RS1-RS6, RSalpha) are just the raw suffix as-is, but the C-line needs real casing (CPLUS ->
 * C+, CMAX -> Cmax, CMINI -> Cmini) since the device only ever reports it fully upper-cased. Falls back to
 * the raw suffix unchanged for any future/unrecognized model, so something informative still shows either way.
 */
const AQUILON_MODEL_NAMES: Record<string, string> = {
	CPLUS: 'C+',
	CMAX: 'Cmax',
	CMINI: 'Cmini',
	RSALPHA: 'RSalpha',
}

export const formatAquilonModel = (dev: string): string => {
	const suffix = dev.replace(/^NLC_/, '')
	return `Aquilon ${AQUILON_MODEL_NAMES[suffix] ?? suffix}`
}

/**
 * Compares two dot-separated firmware version strings (e.g. "5.0.128" vs "6") component by component,
 * numerically, treating a missing trailing component as 0 - so "6" reads the same as "6.0.0" and is below
 * "6.0.4". Returns a negative number if `a` < `b`, positive if `a` > `b`, 0 if equal. Shared by
 * config.ts's isFirmwareBelow() (config-page "Update Suggested" hints) and choices.ts's isFirmwareAtLeast()
 * (gating individual actions/feedbacks/variables that only exist from a specific firmware onward), so both
 * places compare versions the exact same way.
 */
export const compareFirmwareVersions = (a: string, b: string): number => {
	const pa = a.split('.').map((n) => parseInt(n, 10))
	const pb = b.split('.').map((n) => parseInt(n, 10))
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const va = pa[i] ?? 0
		const vb = pb[i] ?? 0
		if (va !== vb) return va - vb
	}
	return 0
}
