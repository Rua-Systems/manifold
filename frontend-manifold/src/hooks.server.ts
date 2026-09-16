import { readSession } from '$lib/server/session';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = ({ event, resolve }) => {
	event.locals.user = readSession(event.cookies);
	return resolve(event);
};
