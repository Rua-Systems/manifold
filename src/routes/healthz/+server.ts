import { getSql } from '#lib/server/db/index.ts';
import type { RequestHandler } from './$types';

const NO_STORE = { 'Cache-Control': 'no-store' };

/** Liveness for the container healthcheck: 200 when the database answers, 503 otherwise. */
export const GET: RequestHandler = async () => {
	try {
		await getSql()`select 1`;
		return Response.json({ status: 'ok' }, { headers: NO_STORE });
	} catch {
		return Response.json({ status: 'unavailable' }, { status: 503, headers: NO_STORE });
	}
};
