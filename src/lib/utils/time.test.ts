import { describe, expect, it } from 'vitest';
import { relativeTime } from './time';

const NOW = new Date('2026-03-10T12:00:00Z');

function secondsAgo(seconds: number): Date {
	return new Date(NOW.getTime() - seconds * 1000);
}

describe('relativeTime', () => {
	it('says now for the last minute', () => {
		expect(relativeTime(secondsAgo(20), 'en', NOW)).toBe('now');
	});

	it('picks the largest whole unit', () => {
		expect(relativeTime(secondsAgo(5 * 60), 'en', NOW)).toBe('5 minutes ago');
		expect(relativeTime(secondsAgo(3 * 60 * 60), 'en', NOW)).toBe('3 hours ago');
		expect(relativeTime(secondsAgo(24 * 60 * 60), 'en', NOW)).toBe('yesterday');
		expect(relativeTime(secondsAgo(15 * 24 * 60 * 60), 'en', NOW)).toBe('2 weeks ago');
	});

	it('uses the given locale', () => {
		expect(relativeTime(secondsAgo(5 * 60), 'tr', NOW)).toBe('5 dakika önce');
	});
});
