import { describe, expect, it } from 'vitest';
import { requestedRange } from './range';

describe('requestedRange', () => {
	it('serves the whole file without a usable header', () => {
		expect(requestedRange(null, 10)).toBeNull();
		expect(requestedRange('bytes=-', 10)).toBeNull();
		expect(requestedRange('bytes=0-1,4-5', 10)).toBeNull();
		expect(requestedRange('items=0-1', 10)).toBeNull();
		expect(requestedRange('bytes=5-3', 10)).toBeNull();
	});

	it('reads a start and an end, both included, and stops at the last byte', () => {
		expect(requestedRange('bytes=2-5', 10)).toEqual({ start: 2, end: 5 });
		expect(requestedRange('bytes=0-', 10)).toEqual({ start: 0, end: 9 });
		expect(requestedRange('bytes=8-100', 10)).toEqual({ start: 8, end: 9 });
		expect(requestedRange(' bytes=3-3 ', 10)).toEqual({ start: 3, end: 3 });
	});

	it('reads a suffix as the last bytes', () => {
		expect(requestedRange('bytes=-3', 10)).toEqual({ start: 7, end: 9 });
		expect(requestedRange('bytes=-30', 10)).toEqual({ start: 0, end: 9 });
	});

	it('refuses a range outside the file', () => {
		expect(requestedRange('bytes=10-', 10)).toBe('unsatisfiable');
		expect(requestedRange('bytes=20-30', 10)).toBe('unsatisfiable');
		expect(requestedRange('bytes=-0', 10)).toBe('unsatisfiable');
	});
});
