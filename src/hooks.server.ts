import type { RequestEvent } from '@sveltejs/kit';
import { building, dev } from '$app/env';
import { getTextDirection } from '#lib/paraglide/runtime.js';
import { paraglideMiddleware } from '#lib/paraglide/server.js';
import { ApiError, errorResponse } from '#lib/server/api/errors.ts';
import { CLIENT_ADDRESS_HEADER, getAuth } from '#lib/server/auth.ts';
import { ownerActor } from '#lib/server/actor.ts';
import { recordAudit } from '#lib/server/audit.ts';
import { checkBodySize } from '#lib/server/body-limit.ts';
import { applySecurityHeaders, CLEAR_SITE_DATA } from '#lib/server/security-headers.ts';
import { getDb, getSql } from '#lib/server/db/index.ts';
import { defaultMigrationsDirectory, runMigrations } from '#lib/server/db/migrate.ts';
import { getEnv, loadEnv } from '#lib/server/env.ts';
import { guardRequest } from '#lib/server/guard.ts';
import { log, logSecurityEvent } from '#lib/server/log.ts';
import { endSession, isPastMaximumAge } from '#lib/server/sessions.ts';
import { startHousekeeping } from '#lib/server/housekeeping.ts';
import { bootstrapOwner } from '#lib/server/owner.ts';
import { housekeepingTasks } from '#lib/server/tasks.ts';
import { getUserSettings } from '#lib/server/user-settings.ts';
import { parseTheme, THEME_COOKIE } from '#lib/utils/theme.ts';
import { randomUUID } from 'node:crypto';

import {
	sequence,
	type Handle,
	type HandleServerError,
	type ServerInit
} from '@sveltejs/kit/hooks';

export const init: ServerInit = async () => {
	if (building) {
		return;
	}

	const config = loadEnv(process.env, { dev });
	const applied = await runMigrations(getSql(), defaultMigrationsDirectory());
	if (applied.length > 0) {
		log('info', 'Applied migrations', { migrations: applied.join(', ') });
	}
	await bootstrapOwner(getDb(), config, { info: (message) => log('info', message) });
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
		logSecurityEvent('cross_site_form', {
			method: request.method,
			path: url.pathname,
			origin: request.headers.get('origin')
		});
		return new Response(`Cross-site ${request.method} form submissions are forbidden`, {
			status: 403
		});
	}
	return resolve(event);
};

const handleBodySize: Handle = ({ event, resolve }) => {
	const check = checkBodySize(event.request);
	const api = event.url.pathname.startsWith('/api/');
	if (check !== 'ok') {
		logSecurityEvent(check === 'too_large' ? 'body_too_large' : 'length_required', {
			method: event.request.method,
			path: event.url.pathname
		});
	}
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
	// The request paraglide hands back is a clone at the same address; SvelteKit 3 makes
	// event.request read-only, so the original goes on.
	paraglideMiddleware(event.request, ({ locale }) => {
		return resolve(event, {
			transformPageChunk: ({ html }) =>
				html
					.replace('%paraglide.lang%', locale)
					.replace('%paraglide.dir%', getTextDirection(locale))
		});
	});

const handleSecurityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	applySecurityHeaders(response.headers, getEnv().ORIGIN.startsWith('https://'));
	if (event.request.method === 'POST' && isLogoutPath(event.url.pathname)) {
		response.headers.set('Clear-Site-Data', CLEAR_SITE_DATA);
	}
	return response;
};

/** `/logout` in every locale, such as `/tr/logout`. */
function isLogoutPath(pathname: string): boolean {
	return /^(\/[a-z]{2})?\/logout$/.test(pathname);
}

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

/** Hands Better Auth the client address adapter-node trusts; see `CLIENT_ADDRESS_HEADER`. */
function setClientAddress(event: RequestEvent): void {
	try {
		event.request.headers.set(CLIENT_ADDRESS_HEADER, event.getClientAddress());
	} catch {
		// No trustworthy address, for example ADDRESS_HEADER set but missing: Better Auth records none.
		event.request.headers.delete(CLIENT_ADDRESS_HEADER);
	}
}

const handleSession: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.session = null;

	setClientAddress(event);
	const result = await getAuth().api.getSession({ headers: event.request.headers });
	if (result !== null && isPastMaximumAge(result.session.createdAt)) {
		await endSession(result.session.id);
		await recordAudit({
			actor: ownerActor(result.user.id),
			action: 'auth.session_expired',
			target: { type: 'session', id: result.session.id }
		});
	} else if (result !== null) {
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

/**
 * An unexpected error: logged with an id, route and method, while the visitor sees only a generic
 * message and the id to quote. Errors thrown with error() and SvelteKit's own 4xx, such as a 404,
 * keep their status and message and are not logged.
 */
export const handleError: HandleServerError = ({ kind, error, event }) => {
	let status = 500;
	if (kind === 'framework') {
		status = error.status;
	} else if (kind !== 'unknown') {
		return;
	}
	if (status < 500) {
		return;
	}
	const id = randomUUID();
	log(
		'error',
		'Request failed',
		{
			id,
			status,
			method: event.request.method,
			route: event.route.id ?? event.url.pathname
		},
		error
	);
	return { id };
};
