import { localizeHref } from '$lib/paraglide/runtime.js';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Pages under the dashboard of early versions are gone; old links and bookmarks land on today's.
export const load: PageServerLoad = () => {
	redirect(308, localizeHref('/dashboard'));
};
