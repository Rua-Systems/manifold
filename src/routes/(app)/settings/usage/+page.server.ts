import { requireUser } from '$lib/server/guard';
import { usageReport } from '$lib/server/usage/report';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireUser(locals);
	return { report: await usageReport() };
};
