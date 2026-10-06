const MEGABYTE = 1024 * 1024;

/** Bytes as megabytes with at most one decimal, for size limits in messages. */
export function formatMegabytes(bytes: number): string {
	return String(Math.round((bytes / MEGABYTE) * 10) / 10);
}

const BYTE_UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'] as const;

/**
 * A size in the largest unit that keeps the number at 1 or more, steps of 1,024, with one decimal
 * from kilobytes on: "512 byte", "1.5 MB".
 */
export function formatBytes(bytes: number, locale: string): string {
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
		value /= 1024;
		unit += 1;
	}
	let digits = 1;
	if (unit === 0) {
		digits = 0;
	}
	return new Intl.NumberFormat(locale, {
		style: 'unit',
		unit: BYTE_UNITS[unit],
		unitDisplay: 'short',
		maximumFractionDigits: digits
	}).format(value);
}

/** A duration in seconds in its largest whole unit up to hours, such as "42 s" or "3.5 h". */
export function formatSeconds(seconds: number, locale: string): string {
	let value = seconds;
	let unit: 'second' | 'minute' | 'hour' = 'second';
	if (seconds >= 60 * 60) {
		value = seconds / (60 * 60);
		unit = 'hour';
	} else if (seconds >= 60) {
		value = seconds / 60;
		unit = 'minute';
	}
	return new Intl.NumberFormat(locale, {
		style: 'unit',
		unit,
		unitDisplay: 'short',
		maximumFractionDigits: 1
	}).format(value);
}
