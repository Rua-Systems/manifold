import { describe, expect, it } from 'vitest';
import {
	clampSidebarWidth,
	parseSidebarWidth,
	SIDEBAR_MAX_WIDTH,
	SIDEBAR_MIN_WIDTH
} from './sidebar-width';

describe('clampSidebarWidth', () => {
	it('keeps widths within the limits', () => {
		expect(clampSidebarWidth(320)).toBe(320);
		expect(clampSidebarWidth(80)).toBe(SIDEBAR_MIN_WIDTH);
		expect(clampSidebarWidth(1200)).toBe(SIDEBAR_MAX_WIDTH);
	});

	it('rounds to whole pixels', () => {
		expect(clampSidebarWidth(301.6)).toBe(302);
	});
});

describe('parseSidebarWidth', () => {
	it('reads whole pixel widths within the limits', () => {
		expect(parseSidebarWidth('200')).toBe(200);
		expect(parseSidebarWidth('500')).toBe(500);
		expect(parseSidebarWidth('333')).toBe(333);
	});

	it('reads an empty value as the default', () => {
		expect(parseSidebarWidth('')).toBeNull();
	});

	it('refuses anything else', () => {
		for (const raw of ['199', '501', '-250', '250.5', '2e2', ' 250', 'wide', '12345']) {
			expect(parseSidebarWidth(raw)).toBeUndefined();
		}
		expect(parseSidebarWidth(null)).toBeUndefined();
		expect(parseSidebarWidth(new File(['250'], 'width.txt'))).toBeUndefined();
	});
});
