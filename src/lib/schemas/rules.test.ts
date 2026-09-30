import { describe, expect, it } from 'vitest';
import { isCalendarDate } from './rules';

describe('isCalendarDate', () => {
	it('accepts real days', () => {
		expect(isCalendarDate('2026-09-30')).toBe(true);
		expect(isCalendarDate('2028-02-29')).toBe(true);
	});

	it('refuses impossible days and other shapes', () => {
		expect(isCalendarDate('2026-13-45')).toBe(false);
		expect(isCalendarDate('2026-02-30')).toBe(false);
		expect(isCalendarDate('2026-9-30')).toBe(false);
		expect(isCalendarDate('')).toBe(false);
	});
});
