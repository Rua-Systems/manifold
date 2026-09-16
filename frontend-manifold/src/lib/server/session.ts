import type { SessionUser } from '$lib/types/user';
import type { Cookies } from '@sveltejs/kit';

export const SESSION_COOKIE = 'manifold_session';

const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

function isSessionUser(value: unknown): value is SessionUser {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const candidate = value as Record<string, unknown>;
	return typeof candidate.email === 'string' && typeof candidate.name === 'string';
}

export function readSession(cookies: Cookies): SessionUser | null {
	const raw = cookies.get(SESSION_COOKIE);
	if (raw === undefined) {
		return null;
	}

	try {
		const parsed: unknown = JSON.parse(raw);
		if (isSessionUser(parsed)) {
			return parsed;
		}
		return null;
	} catch {
		return null;
	}
}

export function writeSession(cookies: Cookies, user: SessionUser): void {
	cookies.set(SESSION_COOKIE, JSON.stringify(user), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: SESSION_MAX_AGE
	});
}

export function clearSession(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}
