import { describe, expect, it } from 'vitest';
import { parseTheme, THEMES } from './theme';

describe('parseTheme', () => {
	it('accepts every supported theme', () => {
		for (const theme of THEMES) {
			expect(parseTheme(theme)).toBe(theme);
		}
	});

	it('rejects anything else', () => {
		expect(parseTheme(undefined)).toBeNull();
		expect(parseTheme('')).toBeNull();
		expect(parseTheme('Dark')).toBeNull();
		expect(parseTheme('sepia')).toBeNull();
	});
});
