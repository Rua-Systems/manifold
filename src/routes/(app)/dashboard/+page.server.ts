import { requireUser } from '$lib/server/guard';
import { loadDashboard } from '$lib/server/dashboard';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireUser(locals);
	return { dashboard: await loadDashboard() };
};
