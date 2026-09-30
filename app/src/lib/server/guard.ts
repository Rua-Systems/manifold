import { localizeHref } from '$lib/paraglide/runtime.js';
import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import type { AuthSession, AuthUser } from './auth';

const PROTECTED_GROUP = '/(app)';

export function isProtectedRoute(routeId: string | null): boolean {
	return routeId !== null && routeId.startsWith(PROTECTED_GROUP);
}

/** Where a guest is sent to sign in, remembering the page they asked for. */
export function signInRedirect(url: URL): string {
	const target = encodeURIComponent(url.pathname + url.search);
	return `${localizeHref('/login')}?redirectTo=${target}`;
}

/**
 * Stops a request without a session. Page requests are sent to sign in; anything else (form
 * actions, data requests) gets a 401, since a layout load never runs before a form action.
 */
export function guardRequest(event: RequestEvent): void {
	if (event.locals.user !== null || !isProtectedRoute(event.route.id)) {
		return;
	}
	if (event.request.method === 'GET' || event.request.method === 'HEAD') {
		redirect(303, signInRedirect(event.url));
	}
	error(401);
}

export interface SignedIn {
	user: AuthUser;
	session: AuthSession;
}

/** The signed in owner, for code that runs behind the guard but needs non-null types. */
export function requireUser(locals: App.Locals): SignedIn {
	if (locals.user === null || locals.session === null) {
		error(401);
	}
	return { user: locals.user, session: locals.session };
}
