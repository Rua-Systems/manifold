import { localizeHref } from '$lib/paraglide/runtime.js';
import { safeRedirectTarget } from '$lib/utils/redirect';
import { parseTheme, THEME_COOKIE, THEME_COOKIE_MAX_AGE } from '$lib/utils/theme';
import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

// This route only receives the theme form, so it has no page of its own.
export const load: PageServerLoad = () => {
	redirect(303, localizeHref('/'));
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();
		const theme = parseTheme(data.get('theme'));

		if (theme !== null) {
			cookies.set(THEME_COOKIE, theme, {
				path: '/',
				sameSite: 'lax',
				maxAge: THEME_COOKIE_MAX_AGE
			});
		}
		redirect(303, safeRedirectTarget(data.get('redirectTo'), localizeHref('/')));
	}
};
