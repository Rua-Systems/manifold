import { SIDEBAR_DEPENDENCY } from '$lib/modules/registry';
import { loadSidebar } from '$lib/modules/registry.server';
import { requireUser } from '$lib/server/guard';
import { getUserSettings } from '$lib/server/user-settings';
import { parseSidebarPreferences, SIDEBAR_COOKIE } from '$lib/utils/sidebar-preferences';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, cookies, depends }) => {
	// hooks.server.ts already sends guests to sign in; this keeps the invariant close to the routes.
	const { user } = requireUser(locals);
	depends(SIDEBAR_DEPENDENCY);

	return {
		sidebar: await loadSidebar(),
		sidebarPreferences: parseSidebarPreferences(cookies.get(SIDEBAR_COOKIE)),
		// From the database rather than the cookie, so every browser opens the sidebar as wide.
		sidebarWidth: (await getUserSettings(user.id)).sidebarWidth
	};
};
