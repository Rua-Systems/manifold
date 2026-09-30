import { resolve } from '$app/paths';
import type { PathnameWithSearchOrHash, ResolvedPathname } from '$app/types';
import { deLocalizeHref, localizeHref, type Locale } from '$lib/paraglide/runtime.js';

// resolve() types every route literal on its own, so it rejects the locale prefixed form of a route
// (`/tr/about`) although that is a valid pathname at runtime. Only the parameter type is widened.
const resolvePathname = resolve as (pathname: string) => ResolvedPathname;

/**
 * Link target for an app path in the current locale, or in `locale` when given. Paraglide adds the
 * locale prefix, then `resolve()` adds the base path (relative during server rendering).
 */
export function localizedHref(path: PathnameWithSearchOrHash, locale?: Locale): ResolvedPathname {
	return resolvePathname(localizeHref(path, { locale }));
}

/** Compares against the locale free path, so `/tr/about` marks the `/about` link as current. */
export function currentMarker(url: URL, href: string): 'page' | undefined {
	if (deLocalizeHref(url.pathname) === href) {
		return 'page';
	}
	return undefined;
}
