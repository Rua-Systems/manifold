import { m } from '$lib/paraglide/messages.js';
import { localizeHref } from '$lib/paraglide/runtime.js';
import { codeRequestSchema, passwordResetSchema } from '$lib/schemas/auth';
import { getAuth } from '$lib/server/auth';
import { isRateLimited } from '$lib/server/rate-limit';
import type { ResetFormState, ResetStage } from '$lib/types/auth';
import type { FieldErrors } from '$lib/types/validation';
import { fieldErrors, textValue } from '$lib/utils/validation';
import { fail, redirect } from '@sveltejs/kit';
import { isAPIError } from 'better-auth/api';
import type { Actions } from './$types';

function resetState(
	stage: ResetStage,
	email: string,
	message = '',
	errors: FieldErrors = {}
): ResetFormState {
	return { stage, email, message, errors };
}

function parseStage(value: string): ResetStage {
	if (value === 'verify') {
		return 'verify';
	}
	return 'request';
}

export const actions: Actions = {
	requestCode: async (event) => {
		const data = await event.request.formData();
		const email = textValue(data, 'email');
		const stage = parseStage(textValue(data, 'stage'));

		if (isRateLimited(event, 'sendCode')) {
			return fail(429, resetState(stage, email, m.error_rate_limited()));
		}

		const parsed = codeRequestSchema.safeParse({ email });
		if (!parsed.success) {
			return fail(400, resetState(stage, email, '', fieldErrors(parsed.error)));
		}

		try {
			await getAuth().api.requestPasswordResetEmailOTP({
				body: { email: parsed.data.email }
			});
		} catch (error) {
			if (isAPIError(error)) {
				return fail(400, resetState(stage, email, m.reset_error_send()));
			}
			throw error;
		}
		return resetState('verify', parsed.data.email);
	},

	reset: async (event) => {
		const data = await event.request.formData();
		const email = textValue(data, 'email');

		if (isRateLimited(event, 'signIn')) {
			return fail(429, resetState('verify', email, m.error_rate_limited()));
		}

		const parsed = passwordResetSchema.safeParse({
			email,
			code: textValue(data, 'code'),
			password: textValue(data, 'password'),
			confirmPassword: textValue(data, 'confirmPassword')
		});
		if (!parsed.success) {
			return fail(400, resetState('verify', email, '', fieldErrors(parsed.error)));
		}

		try {
			await getAuth().api.resetPasswordEmailOTP({
				body: {
					email: parsed.data.email,
					otp: parsed.data.code,
					password: parsed.data.password
				}
			});
		} catch (error) {
			if (isAPIError(error)) {
				return fail(400, resetState('verify', email, m.reset_error_code()));
			}
			throw error;
		}
		redirect(303, localizeHref('/login'));
	}
};
