import { m } from '$lib/paraglide/messages.js';
import { localizeHref } from '$lib/paraglide/runtime.js';
import { originOf, recordAudit } from '$lib/server/audit';
import { getEnv } from '$lib/server/env';
import { NotFoundError } from '$lib/server/errors';
import { logSecurityEvent } from '$lib/server/log';
import { consumeApiRequest, isRateLimited } from '$lib/server/rate-limit';
import { textValue } from '$lib/utils/validation';
import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { getNote, updateNote } from './notes.server';
import { parseContent, writeFailure } from './page.server';
import { noteVersionSchema } from './schemas';
import { authenticateNoteToken, NOTE_TOKEN_COOKIE, type NoteTokenGrant } from './tokens.server';
import type { SharedNote } from './types';

// /shared: a note opened with a note token, without signing in. The share link carries the token
// in its fragment, which the page posts to `open`; from then on an HttpOnly cookie holds it, so
// the token never appears in an address the server or a proxy logs.

function clientIp(event: RequestEvent): string | null {
	return originOf(event).ip;
}

/** The grant of the cookie's token, or null; an invalid token's cookie is removed. */
async function cookieGrant(event: RequestEvent): Promise<NoteTokenGrant | null> {
	const presented = event.cookies.get(NOTE_TOKEN_COOKIE);
	if (presented === undefined) {
		return null;
	}
	const grant = await authenticateNoteToken(presented, { ip: clientIp(event) });
	if (grant === null) {
		event.cookies.delete(NOTE_TOKEN_COOKIE, { path: '/' });
	}
	return grant;
}

/** Requests with a note token count against its rate limit, like the API's. */
function isOverLimit(grant: NoteTokenGrant): boolean {
	const limited = consumeApiRequest(grant.id, getEnv().API_RATE_LIMIT_PER_MINUTE).limited;
	if (limited) {
		logSecurityEvent('rate_limited', { bucket: 'api', keyId: grant.id, path: '/shared' });
	}
	return limited;
}

export async function loadSharedNote(event: RequestEvent): Promise<{ shared: SharedNote | null }> {
	const grant = await cookieGrant(event);
	if (grant === null) {
		return { shared: null };
	}
	if (isOverLimit(grant)) {
		error(429);
	}
	try {
		const found = await getNote(grant.noteId);
		return {
			shared: {
				id: found.id,
				title: found.title,
				content: found.content,
				version: found.version,
				access: grant.access,
				expiresAt: grant.expiresAt
			}
		};
	} catch (cause) {
		if (cause instanceof NotFoundError) {
			return { shared: null };
		}
		throw cause;
	}
}

export const sharedNoteActions = {
	/** Exchanges a token for the cookie that holds it, then shows the note. */
	open: async (event: RequestEvent) => {
		if (isRateLimited(event, 'openSharedNote')) {
			return fail(429, { message: m.error_rate_limited() });
		}
		const data = await event.request.formData();
		const presented = textValue(data, 'token').trim();
		const grant = await authenticateNoteToken(presented, { ip: clientIp(event) });
		if (grant === null) {
			logSecurityEvent('invalid_key', { path: '/shared', ip: clientIp(event) });
			return fail(400, { message: m.shared_invalid() });
		}
		event.cookies.set(NOTE_TOKEN_COOKIE, presented, {
			path: '/',
			httpOnly: true,
			sameSite: 'strict',
			secure: getEnv().ORIGIN.startsWith('https://'),
			expires: grant.expiresAt
		});
		redirect(303, localizeHref('/shared'));
	},

	/** Saves the note for a token with edit access, as the editor's autosave does on the note page. */
	save: async (event: RequestEvent) => {
		const grant = await cookieGrant(event);
		if (grant === null) {
			return fail(401, { message: m.shared_invalid(), conflict: false, errors: {} });
		}
		if (grant.access !== 'edit') {
			return fail(403, { message: m.shared_invalid(), conflict: false, errors: {} });
		}
		if (isOverLimit(grant)) {
			return fail(429, { message: m.error_rate_limited(), conflict: false, errors: {} });
		}
		const data = await event.request.formData();
		const baseVersion = noteVersionSchema.safeParse(textValue(data, 'version'));
		if (!baseVersion.success) {
			return fail(400, { conflict: false, currentVersion: null, errors: {} });
		}
		const actor = { type: 'note_token' as const, id: grant.id };
		try {
			const saved = await updateNote(
				grant.noteId,
				{
					title: textValue(data, 'title'),
					content: parseContent(textValue(data, 'content')),
					baseVersion: baseVersion.data
				},
				actor,
				{ autosave: true }
			);
			await recordAudit({
				actor,
				action: 'note.update',
				target: { type: 'note', id: saved.id },
				metadata: { via: 'shared' },
				origin: originOf(event)
			});
			return { id: saved.id, version: saved.version };
		} catch (cause) {
			return writeFailure(cause);
		}
	},

	/** Forgets the note in this browser. */
	close: async ({ cookies }: RequestEvent) => {
		cookies.delete(NOTE_TOKEN_COOKIE, { path: '/' });
		return { closed: true };
	}
};
