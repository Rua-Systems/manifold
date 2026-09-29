import { getEnv } from '$lib/server/env';
import { getFeatures } from '$lib/server/features';
import { toSessionUser } from '$lib/server/session';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	return {
		user: toSessionUser(locals.user),
		theme: locals.theme,
		organizationName: getEnv().ORGANIZATION_NAME,
		features: getFeatures()
	};
};
