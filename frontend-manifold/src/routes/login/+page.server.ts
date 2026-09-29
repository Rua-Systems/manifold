import { m } from '$lib/paraglide/messages.js';
import { localizeHref } from '$lib/paraglide/runtime.js';
import { codeLoginSchema, codeRequestSchema, passwordLoginSchema } from '$lib/schemas/auth';
import { getAuth } from '$lib/server/auth';
import { emailEnabled } from '$lib/server/features';
import { noteSignIn } from '$lib/server/notices';
import { isRateLimited } from '$lib/server/rate-limit';
import type { LoginFormState, LoginMethod } from '$lib/types/auth';
import type { FieldErrors } from '$lib/types/validation';
import { safeRedirectTarget } from '$lib/utils/redirect';
import { fieldErrors, textValue } from '$lib/utils/validation';
import { error, fail, redirect } from '@sveltejs/kit';
import { isAPIError } from 'better-auth/api';
import type { Actions } from './$types';

function loginState(
	method: LoginMethod,
	identifier: string,
	sent: boolean,
	message = '',
	errors: FieldErrors = {}
): LoginFormState {
	return { method, identifier, sent, message, errors };
}

function redirectTarget(data: FormData): string {
	return safeRedirectTarget(data.get('redirectTo'), localizeHref('/services'));
}

function requireEmail(): void {
	if (!emailEnabled()) {
		error(404);
	}
}

export const actions: Actions = {
	password: async (event) => {
		const data = await event.request.formData();
		const identifier = textValue(data, 'identifier');

		if (isRateLimited(event, 'signIn')) {
			return fail(429, loginState('password', identifier, false, m.error_rate_limited()));
		}

		const parsed = passwordLoginSchema.safeParse({
			identifier,
			password: textValue(data, 'password')
		});
		if (!parsed.success) {
			return fail(
				400,
				loginState('password', identifier, false, '', fieldErrors(parsed.error))
			);
		}

		const { password } = parsed.data;
		const headers = event.request.headers;
		let signedIn: { id: string; email: string };
		try {
			if (parsed.data.identifier.includes('@')) {
				const result = await getAuth().api.signInEmail({
					body: { email: parsed.data.identifier, password },
					headers
				});
				signedIn = result.user;
			} else {
				const result = await getAuth().api.signInUsername({
					body: { username: parsed.data.identifier.toLowerCase(), password },
					headers
				});
				signedIn = result.user;
			}
		} catch (cause) {
			if (isAPIError(cause)) {
				return fail(
					401,
					loginState('password', identifier, false, m.login_error_credentials())
				);
			}
			throw cause;
		}
		await noteSignIn(event, signedIn);
		redirect(303, redirectTarget(data));
	},

	requestCode: async (event) => {
		requireEmail();
		const data = await event.request.formData();
		const email = textValue(data, 'email');

		if (isRateLimited(event, 'sendCode')) {
			return fail(429, loginState('code', email, false, m.error_rate_limited()));
		}

		const parsed = codeRequestSchema.safeParse({ email });
		if (!parsed.success) {
			return fail(400, loginState('code', email, false, '', fieldErrors(parsed.error)));
		}

		try {
			await getAuth().api.sendVerificationOTP({
				body: { email: parsed.data.email, type: 'sign-in' }
			});
		} catch (cause) {
			if (isAPIError(cause)) {
				return fail(400, loginState('code', email, false, m.login_error_code_send()));
			}
			throw cause;
		}
		return loginState('code', parsed.data.email, true);
	},

	verifyCode: async (event) => {
		requireEmail();
		const data = await event.request.formData();
		const email = textValue(data, 'email');

		if (isRateLimited(event, 'signIn')) {
			return fail(429, loginState('code', email, true, m.error_rate_limited()));
		}

		const parsed = codeLoginSchema.safeParse({ email, code: textValue(data, 'code') });
		if (!parsed.success) {
			return fail(400, loginState('code', email, true, '', fieldErrors(parsed.error)));
		}

		let signedIn: { id: string; email: string };
		try {
			const result = await getAuth().api.signInEmailOTP({
				body: { email: parsed.data.email, otp: parsed.data.code },
				headers: event.request.headers
			});
			signedIn = result.user;
		} catch (cause) {
			if (isAPIError(cause)) {
				return fail(401, loginState('code', email, true, m.login_error_code()));
			}
			throw cause;
		}
		await noteSignIn(event, signedIn);
		redirect(303, redirectTarget(data));
	}
};
