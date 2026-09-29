import { localizeHref } from '$lib/paraglide/runtime.js';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// The root has no page of its own: the owner goes to the first module, everyone else to sign in.
export const load: PageServerLoad = ({ locals }) => {
	if (locals.user === null) {
		redirect(303, localizeHref('/login'));
	}
	redirect(303, localizeHref('/services'));
};
