import { requireUser } from '#lib/server/guard.ts';
import { usageReport } from '#lib/server/usage/report.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireUser(locals);
	return { report: await usageReport() };
};
