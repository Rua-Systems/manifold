import type { Path, PathnameWithSearchOrHash } from '$app/types';
import type { Component } from 'svelte';

// SvelteKit 3 writes app paths without the leading slash (`notes`), which only route ids keep.
// Manifold's links, paraglide's localizeHref and the stored hrefs all start with one, so the app
// keeps its own slashed form and drops the slash only where it calls resolve().

/** An app path such as `/notes`. */
export type AppPath = `/${Path}`;

/** An app path with an optional query or hash, such as `/search?q=x`. */
export type AppHref = `/${PathnameWithSearchOrHash}`;

export interface NavigationLink {
	href: AppPath;
	label: () => string;
}
export interface AsideLink extends NavigationLink {
	icon: Component;
}
