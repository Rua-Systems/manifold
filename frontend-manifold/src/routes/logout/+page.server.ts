import { localizeHref } from '$lib/paraglide/runtime.js';
import { ownerActor } from '$lib/server/actor';
import { originOf, recordAudit } from '$lib/server/audit';
import { getAuth } from '$lib/server/auth';
import { redirect } from '@sveltejs/kit';
import { isAPIError } from 'better-auth/api';
import type { Actions, PageServerLoad } from './$types';

// This route only receives the logout form, so it has no page of its own.
export const load: PageServerLoad = () => {
	redirect(303, localizeHref('/'));
};

export const actions: Actions = {
	default: async (event) => {
		const { request, locals } = event;
		if (locals.user !== null) {
			await recordAudit({
				actor: ownerActor(locals.user.id),
				action: 'auth.sign_out',
				origin: originOf(event)
			});
		}
		try {
			await getAuth().api.signOut({ headers: request.headers });
		} catch (error) {
			if (!isAPIError(error)) {
				throw error;
			}
		}
		redirect(303, localizeHref('/'));
	}
};
