import { authenticateApiKey } from '$lib/server/api-keys';
import { fileResponse, findFile, readFileBytes } from '$lib/server/files/files';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** An API key with the `files:read` scope may fetch files here too. */
async function keyAllows(request: Request, ip: string): Promise<boolean> {
	const token = /^Bearer\s+(\S+)\s*$/i.exec(request.headers.get('authorization') ?? '')?.[1];
	if (token === undefined) {
		return false;
	}
	const key = await authenticateApiKey(token, { ip });
	return key !== null && key.scopes.includes('files:read');
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
