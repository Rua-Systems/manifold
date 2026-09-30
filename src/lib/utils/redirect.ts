const PLACEHOLDER_ORIGIN = 'http://manifold.invalid';

/**
 * Returns `target` only when it is a path on this site. Anything else falls back, so a crafted
 * `redirectTo` cannot send the user to another origin. The target is parsed the way a browser
 * parses it, which drops tabs and line breaks and reads a backslash as a slash, so targets such as
 * `/<tab>/evil.example` cannot pass as local paths.
 */
export function safeRedirectTarget(target: unknown, fallback: string): string {
	if (typeof target !== 'string' || target.length === 0 || !target.startsWith('/')) {
		return fallback;
	}
	let url: URL;
	try {
		url = new URL(target, PLACEHOLDER_ORIGIN);
	} catch {
		return fallback;
	}
	if (url.origin !== PLACEHOLDER_ORIGIN) {
		return fallback;
	}
	return `${url.pathname}${url.search}${url.hash}`;
}
