import { localizeHref } from '$lib/paraglide/runtime.js';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// The dashboard was replaced by the modules; old links and bookmarks land on the first one.
export const load: PageServerLoad = () => {
	redirect(308, localizeHref('/services'));
};
