import { describe, expect, it } from 'vitest';
import { fillDays, lastDays, startOfLastDays } from './days';

const NOW = new Date('2026-10-06T21:30:00Z');

describe('days', () => {
	it('lists the last days up to today in UTC, oldest first', () => {
		expect(lastDays(3, NOW)).toEqual(['2026-10-04', '2026-10-05', '2026-10-06']);
		expect(lastDays(2, new Date('2026-03-01T00:10:00Z'))).toEqual(['2026-02-28', '2026-03-01']);
	});

	it('fills the days without a count with zero', () => {
		expect(fillDays([{ day: '2026-10-05', count: 4 }], 3, NOW)).toEqual([
			{ day: '2026-10-04', value: 0 },
			{ day: '2026-10-05', value: 4 },
			{ day: '2026-10-06', value: 0 }
		]);
	});

	it('starts the query at midnight of the first day', () => {
		expect(startOfLastDays(7, NOW).toISOString()).toBe('2026-09-30T00:00:00.000Z');
	});
});
