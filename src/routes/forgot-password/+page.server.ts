import { m } from '$lib/paraglide/messages.js';
import { localizeHref } from '$lib/paraglide/runtime.js';
import { codeRequestSchema, passwordResetSchema } from '$lib/schemas/auth';
import { findUserIdByEmail } from '$lib/server/account';
import { ownerActor, SYSTEM_ACTOR } from '$lib/server/actor';
import { originOf, recordAudit } from '$lib/server/audit';
import { getAuth } from '$lib/server/auth';
import { emailEnabled } from '$lib/server/features';
import { notePasswordChanged } from '$lib/server/notices';
import { isRateLimited } from '$lib/server/rate-limit';
import type { ResetFormState, ResetStage } from '$lib/types/auth';
import type { FieldErrors } from '$lib/types/validation';
import { fieldErrors, textValue } from '$lib/utils/validation';
import { error, fail, redirect } from '@sveltejs/kit';
import { isAPIError } from 'better-auth/api';
import type { Actions, PageServerLoad } from './$types';

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

// The reset works through emailed codes, so without mail the page does not exist.
function requireEmail(): void {
	if (!emailEnabled()) {
		error(404);
	}
}

export const load: PageServerLoad = () => {
	requireEmail();
};

export const actions: Actions = {
	requestCode: async (event) => {
		requireEmail();
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
		} catch (cause) {
			if (isAPIError(cause)) {
				return fail(400, resetState(stage, email, m.reset_error_send()));
			}
			throw cause;
		}
		return resetState('verify', parsed.data.email);
	},

	reset: async (event) => {
		requireEmail();
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
		} catch (cause) {
			if (isAPIError(cause)) {
				return fail(400, resetState('verify', email, m.reset_error_code()));
			}
			throw cause;
		}
		const userId = await findUserIdByEmail(parsed.data.email);
		await recordAudit({
			actor: userId === null ? SYSTEM_ACTOR : ownerActor(userId),
			action: 'auth.password_reset',
			origin: originOf(event)
		});
		await notePasswordChanged(event, parsed.data.email);
		redirect(303, localizeHref('/login'));
	}
};
