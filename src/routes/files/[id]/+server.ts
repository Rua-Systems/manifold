import { authenticateApiKey } from '$lib/server/api-keys';
import { getEnv } from '$lib/server/env';
import { fileResponse, findFile, readFileBytes } from '$lib/server/files/files';
import { logSecurityEvent } from '$lib/server/log';
import { consumeApiRequest } from '$lib/server/rate-limit';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * An API key with the `files:read` scope may fetch files here too. Its requests count against the
 * key's rate limit like any other API request.
 */
async function keyAllows(request: Request, ip: string): Promise<boolean> {
	const token = /^Bearer\s+(\S+)\s*$/i.exec(request.headers.get('authorization') ?? '')?.[1];
	if (token === undefined) {
		return false;
	}
	const key = await authenticateApiKey(token, { ip });
	if (key === null || !key.scopes.includes('files:read')) {
		logSecurityEvent(key === null ? 'invalid_key' : 'insufficient_scope', {
			path: '/files',
			ip
		});
		return false;
	}
	if (consumeApiRequest(key.id, getEnv().API_RATE_LIMIT_PER_MINUTE).limited) {
		logSecurityEvent('rate_limited', { bucket: 'api', keyId: key.id, path: '/files' });
		error(429);
	}
	return true;
}

// Serves uploaded files to the signed in owner. Outside the (app) group so a missing session
// answers 401 instead of redirecting an image request to the sign in page.
export const GET: RequestHandler = async ({ params, locals, request, getClientAddress }) => {
	if (locals.user === null && !(await keyAllows(request, getClientAddress()))) {
		error(401);
	}

	const stored = await findFile(params.id);
	if (stored === null) {
		error(404);
	}
	const bytes = await readFileBytes(stored);
	if (bytes === null) {
		error(404);
	}
	return fileResponse(stored, bytes);
};
