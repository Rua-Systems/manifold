import type { Theme } from '$lib/types/theme';

export const THEME_COOKIE = 'manifold_theme';

export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const THEMES: readonly Theme[] = ['light', 'dark'];

export function parseTheme(value: unknown): Theme | null {
	if (value === 'light' || value === 'dark') {
		return value;
	}
	return null;
}
