import { toSessionUser } from '$lib/server/session';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	return { user: toSessionUser(locals.user), theme: locals.theme };
};
