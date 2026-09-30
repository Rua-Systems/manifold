import { building, dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { getTextDirection } from '$lib/paraglide/runtime.js';
import { paraglideMiddleware } from '$lib/paraglide/server.js';
import { ApiError, errorResponse } from '$lib/server/api/errors';
import { getAuth } from '$lib/server/auth';
import { checkBodySize } from '$lib/server/body-limit';
import { getDb, getSql } from '$lib/server/db';
import { defaultMigrationsDirectory, runMigrations } from '$lib/server/db/migrate';
import { getEnv, loadEnv } from '$lib/server/env';
import { guardRequest } from '$lib/server/guard';
import { startHousekeeping } from '$lib/server/housekeeping';
import { bootstrapOwner } from '$lib/server/owner';
import { housekeepingTasks } from '$lib/server/tasks';
import { getUserSettings } from '$lib/server/user-settings';
import { parseTheme, THEME_COOKIE } from '$lib/utils/theme';
import type { Handle, ServerInit } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

// Only geolocation (the map's "my location" button) is allowed; the other powerful features are off.
const PERMISSIONS_POLICY = [
	'geolocation=(self)',
	'camera=()',
	'microphone=()',
	'payment=()',
	'usb=()'
].join(', ');

export const init: ServerInit = async () => {
	if (building) {
		return;
	}

	const config = loadEnv(env, { dev });
	const applied = await runMigrations(getSql(), defaultMigrationsDirectory());
	if (applied.length > 0) {
		console.info(`Applied migrations: ${applied.join(', ')}`);
	}
	await bootstrapOwner(getDb(), config);
	startHousekeeping(housekeepingTasks());
};

const FORM_CONTENT_TYPES = [
	'application/x-www-form-urlencoded',
	'multipart/form-data',
	'text/plain'
];
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * SvelteKit's cross-site form check, run here so /api/ can be left out: a form post whose Origin
 * is not this site is refused. The API authenticates by Bearer key alone, so a cross-site form
 * could not act as the owner there.
 */
const handleCsrf: Handle = ({ event, resolve }) => {
	const { request, url } = event;
	const type = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() ?? '';
	const isForm = FORM_CONTENT_TYPES.includes(type);
	if (
		isForm &&
		UNSAFE_METHODS.has(request.method) &&
		!url.pathname.startsWith('/api/') &&
		request.headers.get('origin') !== url.origin
	) {
		return new Response(`Cross-site ${request.method} form submissions are forbidden`, {
			status: 403
		});
	}
	return resolve(event);
};

const handleBodySize: Handle = ({ event, resolve }) => {
	const check = checkBodySize(event.request);
	const api = event.url.pathname.startsWith('/api/');
	if (check === 'too_large') {
		return api
			? errorResponse(
					new ApiError(413, 'payload_too_large', 'The body is larger than the limit.')
				)
			: new Response('Payload Too Large', { status: 413 });
	}
	if (check === 'length_required') {
		return api
			? errorResponse(new ApiError(411, 'length_required', 'Send a Content-Length header.'))
			: new Response('Length Required', { status: 411 });
	}
	return resolve(event);
};

const handleLocale: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;
		return resolve(event, {
			transformPageChunk: ({ html }) =>
				html
					.replace('%paraglide.lang%', locale)
					.replace('%paraglide.dir%', getTextDirection(locale))
		});
	});

const handleSecurityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('X-Robots-Tag', 'noindex, nofollow');
	response.headers.set('Permissions-Policy', PERMISSIONS_POLICY);
	if (getEnv().ORIGIN.startsWith('https://')) {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}
	return response;
};

/**
 * The browser's own choice wins; a browser that has none starts with the owner's default theme.
 * Runs after the session is known.
 */
const handleTheme: Handle = async ({ event, resolve }) => {
	let theme = parseTheme(event.cookies.get(THEME_COOKIE));
	if (theme === null && event.locals.user !== null) {
		theme = (await getUserSettings(event.locals.user.id)).theme;
	}
	event.locals.theme = theme;

	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%manifold.theme%', theme ?? '')
	});
};

const handleSession: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.session = null;

	const result = await getAuth().api.getSession({ headers: event.request.headers });
	if (result !== null) {
		event.locals.user = result.user;
		event.locals.session = result.session;
	}

	guardRequest(event);
	return resolve(event);
};

export const handle: Handle = sequence(
	handleLocale,
	handleSecurityHeaders,
	handleCsrf,
	handleBodySize,
	handleSession,
	handleTheme
);
