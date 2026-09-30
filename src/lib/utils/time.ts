const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
	['year', 365 * 24 * 60 * 60],
	['month', 30 * 24 * 60 * 60],
	['week', 7 * 24 * 60 * 60],
	['day', 24 * 60 * 60],
	['hour', 60 * 60],
	['minute', 60]
];

/**
 * "5 minutes ago" in the given locale. Relative times read the same on the server and in the
 * browser, whatever their time zones, so server rendered text survives hydration.
 */
export function relativeTime(date: Date, locale: string, now = new Date()): string {
	const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
	const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
	for (const [unit, size] of UNITS) {
		if (Math.abs(seconds) >= size) {
			return format.format(Math.trunc(seconds / size), unit);
		}
	}
	return format.format(0, 'second');
}
