/**
 * Returns `target` only when it is a path on this site. Anything else falls back, so a crafted
 * `redirectTo` cannot send the user to another origin. Browsers treat `/\` like `//`, hence both
 * checks.
 */
export function safeRedirectTarget(target: unknown, fallback: string): string {
	if (typeof target !== 'string' || target.length === 0) {
		return fallback;
	}
	if (!target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) {
		return fallback;
	}
	return target;
}
