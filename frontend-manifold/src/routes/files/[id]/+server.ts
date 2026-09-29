import { fileResponse, findFile, readFileBytes } from '$lib/server/files/files';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Serves uploaded files to the signed in owner. Outside the (app) group so a missing session
// answers 401 instead of redirecting an image request to the sign in page.
export const GET: RequestHandler = async ({ params, locals }) => {
	if (locals.user === null) {
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
