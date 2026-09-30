import { handleApiRequest } from '$lib/server/api/router';
import { originOf } from '$lib/server/audit';
import type { RequestHandler } from './$types';

// Every /api/v1 request goes to the router, which serves the routes of the core and the modules.
const handle: RequestHandler = (event) =>
	handleApiRequest(event.request, { origin: originOf(event) });

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const fallback = handle;
