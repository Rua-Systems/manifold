import { loadSidebar } from '$lib/modules/registry.server';
import { requireUser } from '$lib/server/guard';
import { parseSidebarPreferences, SIDEBAR_COOKIE } from '$lib/utils/sidebar-preferences';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	// hooks.server.ts already sends guests to sign in; this keeps the invariant close to the routes.
	requireUser(locals);

	return {
		sidebar: await loadSidebar(),
		sidebarPreferences: parseSidebarPreferences(cookies.get(SIDEBAR_COOKIE))
	};
};
