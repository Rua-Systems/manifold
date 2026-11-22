import { resolve } from '$app/paths';
import type { ResolvedPathname } from '$app/types';
import type { AppHref } from '#lib/types/navigation.ts';
import { deLocalizeHref, localizeHref, type Locale } from '#lib/paraglide/runtime.js';

// resolve() types every route literal on its own, so it rejects the locale prefixed form of a route
// (`tr/about`) although that is a valid path at runtime. Only the parameter type is widened.
const resolvePathname = resolve as (path: string) => ResolvedPathname;

/**
 * Link target for an app path in the current locale, or in `locale` when given. Paraglide adds the
 * locale prefix, then `resolve()` adds the base path (relative during server rendering).
 */
export function localizedHref(path: AppHref, locale?: Locale): ResolvedPathname {
	// A leading slash would make resolve() read the path as a route id, so it is dropped here.
	return resolvePathname(localizeHref(path, { locale }).slice(1));
}

/** Compares against the locale free path, so `/tr/about` marks the `/about` link as current. */
export function currentMarker(url: Pick<URL, 'pathname'>, href: string): 'page' | undefined {
	if (deLocalizeHref(url.pathname) === href) {
		return 'page';
	}
	return undefined;
}
