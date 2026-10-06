import { describe, expect, it } from 'vitest';
import { formatBytes, formatSeconds } from './format';

describe('formatBytes', () => {
	it('picks the largest unit that keeps the number at 1 or more', () => {
		expect(formatBytes(0, 'en')).toBe('0 byte');
		expect(formatBytes(512, 'en')).toBe('512 byte');
		expect(formatBytes(1536, 'en')).toBe('1.5 kB');
		expect(formatBytes(5 * 1024 * 1024, 'en')).toBe('5 MB');
		expect(formatBytes(3.25 * 1024 ** 3, 'en')).toBe('3.3 GB');
	});

	it('stops at terabytes', () => {
		expect(formatBytes(2048 * 1024 ** 4, 'en')).toBe('2,048 TB');
	});

	it('uses the given locale', () => {
		expect(formatBytes(1536, 'tr')).toBe('1,5 kB');
	});
});

describe('formatSeconds', () => {
	it('uses seconds, minutes or hours', () => {
		expect(formatSeconds(42.25, 'en')).toBe('42.3 sec');
		expect(formatSeconds(90, 'en')).toBe('1.5 min');
		expect(formatSeconds(5 * 60 * 60, 'en')).toBe('5 hr');
	});
});
