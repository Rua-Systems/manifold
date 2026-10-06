import type { DashboardDay } from '$lib/types/dashboard';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The last `count` days up to and including today, oldest first, as `YYYY-MM-DD` in UTC. */
export function lastDays(count: number, now = new Date()): string[] {
	const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	const days: string[] = [];
	for (let index = count - 1; index >= 0; index -= 1) {
		days.push(new Date(today - index * DAY_MS).toISOString().slice(0, 10));
	}
	return days;
}

/** A daily series over the last `count` days, with zero for every day that has no count. */
export function fillDays(
	counts: { day: string; count: number }[],
	count: number,
	now = new Date()
): DashboardDay[] {
	const byDay = new Map(counts.map((entry) => [entry.day, entry.count]));
	return lastDays(count, now).map((day) => ({ day, value: byDay.get(day) ?? 0 }));
}

/** The start of the first of the last `count` days, for the query that counts them. */
export function startOfLastDays(count: number, now = new Date()): Date {
	return new Date(`${lastDays(count, now)[0]}T00:00:00Z`);
}
