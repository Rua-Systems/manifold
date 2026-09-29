import type { Theme } from '$lib/types/theme';
import { parseTheme } from '$lib/utils/theme';
import { getContext, setContext } from 'svelte';

const THEME_KEY = Symbol('theme');

export class ThemeState {
	current = $state<Theme | null>(null);

	constructor(initial: Theme | null) {
		this.current = initial;
	}

	/**
	 * Without a theme cookie the server cannot know the theme, so the inline script in app.html
	 * picks it from prefers-color-scheme before first paint. This reads that choice back.
	 */
	syncFromDocument(): void {
		const applied = parseTheme(document.documentElement.dataset.theme);
		if (applied !== null) {
			this.current = applied;
		}
	}

	apply(theme: Theme): void {
		this.current = theme;
		document.documentElement.dataset.theme = theme;
	}
}

export function setThemeState(initial: Theme | null): ThemeState {
	return setContext(THEME_KEY, new ThemeState(initial));
}

export function getThemeState(): ThemeState {
	return getContext<ThemeState>(THEME_KEY);
}
