import {
	NOTE_TOKEN_COOKIE,
	authenticateNoteToken,
	noteShowsFile
} from '$lib/modules/notes/tokens.server';
import { authenticateCredential } from '$lib/server/api/credentials';
import { getEnv } from '$lib/server/env';
import { findFile, serveFile } from '$lib/server/files/files';
import { logSecurityEvent } from '$lib/server/log';
import { consumeApiRequest } from '$lib/server/rate-limit';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** Requests with a key or a note token count against its rate limit like any API request. */
function countRequest(id: string): void {
	if (consumeApiRequest(id, getEnv().API_RATE_LIMIT_PER_MINUTE).limited) {
		logSecurityEvent('rate_limited', { bucket: 'api', keyId: id, path: '/files' });
		error(429);
	}
}

/**
 * An API key with the `files:read` scope may fetch any file here; a note token, sent as a Bearer
 * key or held in the cookie of a shared note, only the files its note shows.
 */
async function bearerAllows(request: Request, fileId: string, ip: string): Promise<boolean> {
	const token = /^Bearer\s+(\S+)\s*$/i.exec(request.headers.get('authorization') ?? '')?.[1];
	if (token === undefined) {
		return false;
	}
	const key = await authenticateCredential(token, { ip });
	if (key === null) {
		logSecurityEvent('invalid_key', { path: '/files', ip });
		return false;
	}
	let allowed = key.scopes.includes('files:read');
	if (key.note !== undefined) {
		allowed = await noteShowsFile(key.note.id, fileId);
	}
	if (!allowed) {
		logSecurityEvent('insufficient_scope', { path: '/files', ip });
		return false;
	}
	countRequest(key.id);
	return true;
}

async function sharedNoteAllows(presented: string, fileId: string, ip: string): Promise<boolean> {
	const grant = await authenticateNoteToken(presented, { ip });
	if (grant === null || !(await noteShowsFile(grant.noteId, fileId))) {
		return false;
	}
	countRequest(grant.id);
	return true;
}

// Serves uploaded files to the signed in owner. Outside the (app) group so a missing session
// answers 401 instead of redirecting an image request to the sign in page.
export const GET: RequestHandler = async ({
	params,
	locals,
	request,
	cookies,
	getClientAddress
}) => {
	if (locals.user === null) {
		const ip = getClientAddress();
		const shared = cookies.get(NOTE_TOKEN_COOKIE);
		const allowed =
			(await bearerAllows(request, params.id, ip)) ||
			(shared !== undefined && (await sharedNoteAllows(shared, params.id, ip)));
		if (!allowed) {
			error(401);
		}
	}

	const stored = await findFile(params.id);
	if (stored === null) {
		error(404);
	}
	const response = await serveFile(stored, request);
	if (response === null) {
		error(404);
	}
	return response;
};
