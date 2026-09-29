import { localizeHref } from '$lib/paraglide/runtime.js';
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, url }) => {
	if (locals.user === null) {
		const target = encodeURIComponent(url.pathname + url.search);
		redirect(303, `${localizeHref('/login')}?redirectTo=${target}`);
	}
};
