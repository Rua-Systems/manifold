import { localizeHref } from '$lib/paraglide/runtime.js';
import { requireUser } from '$lib/server/guard';
import { saveSidebarWidth } from '$lib/server/user-settings';
import { parseSidebarWidth } from '$lib/utils/sidebar-width';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

// This route only receives the width the sidebar was dragged to, so it has no page of its own.
export const load: PageServerLoad = () => {
	redirect(303, localizeHref('/dashboard'));
};

export const actions: Actions = {
	width: async ({ request, locals }) => {
		const { user } = requireUser(locals);
		const width = parseSidebarWidth((await request.formData()).get('width'));
		if (width === undefined) {
			return fail(400, { saved: false });
		}
		await saveSidebarWidth(user.id, width);
		return { saved: true };
	}
};
