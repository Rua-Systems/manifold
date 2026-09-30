import { describe, expect, it } from 'vitest';
import { safeRedirectTarget } from './redirect';

const FALLBACK = '/dashboard';

describe('safeRedirectTarget', () => {
	it('keeps local paths', () => {
		expect(safeRedirectTarget('/dashboard/map-notes', FALLBACK)).toBe('/dashboard/map-notes');
		expect(safeRedirectTarget('/tr/profile?tab=1', FALLBACK)).toBe('/tr/profile?tab=1');
		expect(safeRedirectTarget('/notes/new#top', FALLBACK)).toBe('/notes/new#top');
	});

	it('falls back for missing or non string values', () => {
		expect(safeRedirectTarget(null, FALLBACK)).toBe(FALLBACK);
		expect(safeRedirectTarget('', FALLBACK)).toBe(FALLBACK);
		expect(safeRedirectTarget(42, FALLBACK)).toBe(FALLBACK);
	});

	it('rejects targets on other origins', () => {
		expect(safeRedirectTarget('https://example.com', FALLBACK)).toBe(FALLBACK);
		expect(safeRedirectTarget('//example.com', FALLBACK)).toBe(FALLBACK);
		expect(safeRedirectTarget('/\\example.com', FALLBACK)).toBe(FALLBACK);
		expect(safeRedirectTarget('dashboard', FALLBACK)).toBe(FALLBACK);
	});

	it('rejects targets that browsers read as another origin', () => {
		expect(safeRedirectTarget('/\t/evil.example', FALLBACK)).toBe(FALLBACK);
		expect(safeRedirectTarget('/\n/evil.example', FALLBACK)).toBe(FALLBACK);
		expect(safeRedirectTarget('/\r\n/evil.example/path', FALLBACK)).toBe(FALLBACK);
		expect(safeRedirectTarget('/\t\\evil.example', FALLBACK)).toBe(FALLBACK);
		expect(safeRedirectTarget('/\\\\evil.example', FALLBACK)).toBe(FALLBACK);
	});
});
