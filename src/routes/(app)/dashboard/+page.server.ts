import { requireUser } from '#lib/server/guard.ts';
import { loadDashboard } from '#lib/server/dashboard.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireUser(locals);
	return { dashboard: await loadDashboard() };
};
