import { requireUser } from '$lib/server/guard';
import type { LayoutServerLoad } from './$types';

// hooks.server.ts already sends guests to sign in; this keeps the invariant close to the routes.
export const load: LayoutServerLoad = ({ locals }) => {
	requireUser(locals);
};
