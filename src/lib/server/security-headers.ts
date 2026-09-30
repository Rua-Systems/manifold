// Security headers shared by the Node server entry (src/server.ts), which puts them on every
// response including the static build files, and the SvelteKit hook, which fills in the rest for
// the responses the app renders. Plain module: the server entry is built without SvelteKit.

// Only geolocation (the map's "my location" button) is allowed; the other powerful features are off.
const PERMISSIONS_POLICY = [
	'geolocation=(self)',
	'camera=()',
	'microphone=()',
	'payment=()',
	'usb=()'
].join(', ');

/** For everything that is not a page: nothing may load, frame or run. Pages get their own CSP. */
export const RESOURCE_CONTENT_SECURITY_POLICY =
	"default-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'";

const STRICT_TRANSPORT_SECURITY = 'max-age=31536000; includeSubDomains';

/** Sent when signing out, so the browser drops cached pages and stored data such as the map view. */
export const CLEAR_SITE_DATA = '"cache", "storage"';

const TEXT_TYPE =
	/^(text\/[\w.+-]+|application\/(json|javascript|xml|[\w.+-]+\+(json|xml))|image\/svg\+xml)$/i;

const CHARSET_PARAMETER = /;\s*charset=/i;

/** The headers every response carries; `https` adds HSTS. */
export function baselineHeaders(https: boolean): [string, string][] {
	const headers: [string, string][] = [
		['X-Content-Type-Options', 'nosniff'],
		['X-Frame-Options', 'DENY'],
		['Referrer-Policy', 'strict-origin-when-cross-origin'],
		['X-Robots-Tag', 'noindex, nofollow'],
		['Permissions-Policy', PERMISSIONS_POLICY],
		['Cross-Origin-Opener-Policy', 'same-origin'],
		['Content-Security-Policy', RESOURCE_CONTENT_SECURITY_POLICY]
	];
	if (https) {
		headers.push(['Strict-Transport-Security', STRICT_TRANSPORT_SECURITY]);
	}
	return headers;
}

/**
 * Completes the headers of a response the app rendered. A CSP the response already has (pages,
 * uploaded files) stays; text types get `charset=utf-8`; anything without its own cache policy is
 * never stored, since pages, data and action answers belong to the signed in owner.
 */
export function applySecurityHeaders(headers: Headers, https: boolean): void {
	for (const [name, value] of baselineHeaders(https)) {
		if (name !== 'Content-Security-Policy' || !headers.has(name)) {
			headers.set(name, value);
		}
	}
	if (!headers.has('Cache-Control')) {
		headers.set('Cache-Control', 'no-store');
	}
	const type = headers.get('Content-Type');
	if (type !== null && !CHARSET_PARAMETER.test(type)) {
		const mediaType = type.split(';', 1)[0].trim();
		if (TEXT_TYPE.test(mediaType)) {
			headers.set('Content-Type', `${type}; charset=utf-8`);
		}
	}
}
