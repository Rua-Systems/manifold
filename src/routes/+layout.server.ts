import { getEnv } from '#lib/server/env.ts';
import { getFeatures } from '#lib/server/features.ts';
import { toSessionUser } from '#lib/server/session.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	return {
		user: toSessionUser(locals.user),
		theme: locals.theme,
		organizationName: getEnv().ORGANIZATION_NAME,
		features: getFeatures()
	};
};
