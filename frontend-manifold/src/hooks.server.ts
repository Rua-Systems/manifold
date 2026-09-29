import { building } from '$app/environment';
import { getTextDirection } from '$lib/paraglide/runtime.js';
import { paraglideMiddleware } from '$lib/paraglide/server.js';
import { getAuth } from '$lib/server/auth';
import { parseTheme, THEME_COOKIE } from '$lib/utils/theme';
import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

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
	return response;
};

const handleTheme: Handle = ({ event, resolve }) => {
	const theme = parseTheme(event.cookies.get(THEME_COOKIE));
	event.locals.theme = theme;

	return resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%manifold.theme%', theme ?? '')
	});
};

const handleSession: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.session = null;

	if (!building) {
		const result = await getAuth().api.getSession({ headers: event.request.headers });
		if (result !== null) {
			event.locals.user = result.user;
			event.locals.session = result.session;
		}
	}
	return resolve(event);
};

export const handle: Handle = sequence(
	handleLocale,
	handleSecurityHeaders,
	handleTheme,
	handleSession
);
