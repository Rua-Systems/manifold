import { m } from '$lib/paraglide/messages.js';
import { codeSchema } from '$lib/schemas/auth';
import { stepUpSchema } from '$lib/schemas/security';
import { requireUser } from '$lib/server/guard';
import {
	countFailedCredentialCheck,
	isCredentialCheckBlocked,
	isRateLimited
} from '$lib/server/rate-limit';
import { confirmIdentity } from '$lib/server/step-up';
import { safeRedirectTarget } from '$lib/utils/redirect';
import { fieldErrors, textValue } from '$lib/utils/validation';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

// The step-up form as a page of its own, for browsers without JavaScript; the dialog posts here too.

export const load: PageServerLoad = ({ url }) => {
	return { redirectTo: safeRedirectTarget(url.searchParams.get('redirectTo'), '') };
};

export const actions = {
	confirm: async (event) => {
		const signedIn = requireUser(event.locals);
		const data = await event.request.formData();

		if (isRateLimited(event, 'stepUp') || isCredentialCheckBlocked(signedIn.user.id)) {
			return fail(429, { errors: {}, message: m.error_rate_limited() });
		}

		const parsed = stepUpSchema.safeParse({
			password: textValue(data, 'password'),
			code: textValue(data, 'code')
		});
		if (!parsed.success) {
			return fail(400, { errors: fieldErrors(parsed.error), message: '' });
		}
		if (signedIn.user.twoFactorEnabled === true) {
			const code = codeSchema.safeParse(parsed.data.code);
			if (!code.success) {
				return fail(400, { errors: { code: code.error.issues[0].message }, message: '' });
			}
		}

		const result = await confirmIdentity(event, signedIn, parsed.data);
		if (result !== 'confirmed') {
			countFailedCredentialCheck(signedIn.user.id);
		}
		if (result === 'wrong_password') {
			return fail(400, {
				errors: { password: m.settings_error_current_password() },
				message: ''
			});
		}
		if (result === 'wrong_code') {
			return fail(400, { errors: { code: m.security_error_code() }, message: '' });
		}

		const target = safeRedirectTarget(data.get('redirectTo'), '');
		if (target.length > 0) {
			redirect(303, target);
		}
		return { errors: {}, message: m.step_up_confirmed() };
	}
} satisfies Actions;
