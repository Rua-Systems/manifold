import { m } from '$lib/paraglide/messages.js';
import { localizeHref } from '$lib/paraglide/runtime.js';
import {
	backupCodeSchema,
	codeLoginSchema,
	codeRequestSchema,
	codeSchema,
	passwordLoginSchema
} from '$lib/schemas/auth';
import { ownerActor, SYSTEM_ACTOR } from '$lib/server/actor';
import { originOf, recordAudit } from '$lib/server/audit';
import { getAuth } from '$lib/server/auth';
import { emailEnabled } from '$lib/server/features';
import { noteSignIn } from '$lib/server/notices';
import { isRateLimited } from '$lib/server/rate-limit';
import type { LoginFormState, LoginMethod, SecondFactor } from '$lib/types/auth';
import type { FieldErrors } from '$lib/types/validation';
import { safeRedirectTarget } from '$lib/utils/redirect';
import { fieldErrors, textValue } from '$lib/utils/validation';
import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { isAPIError } from 'better-auth/api';
import type { Actions } from './$types';

function loginState(
	method: LoginMethod,
	identifier: string,
	sent: boolean,
	message = '',
	errors: FieldErrors = {}
): LoginFormState {
	return { method, identifier, sent, twoFactor: false, message, errors };
}

/** The first factor was right; the form asks for a TOTP or backup code next. */
function twoFactorState(
	method: LoginMethod,
	message = '',
	errors: FieldErrors = {}
): LoginFormState {
	return { method, identifier: '', sent: false, twoFactor: true, message, errors };
}

/** Better Auth answers `twoFactorRedirect` instead of a session while the second step is due. */
function needsSecondFactor(result: object): boolean {
	return 'twoFactorRedirect' in result && result.twoFactorRedirect === true;
}

function errorCode(cause: unknown): string {
	if (isAPIError(cause)) {
		const body: unknown = cause.body;
		if (typeof body === 'object' && body !== null && 'code' in body) {
			return String(body.code);
		}
	}
	return '';
}

async function auditSignIn(
	event: RequestEvent,
	userId: string,
	metadata: Record<string, string>
): Promise<void> {
	await recordAudit({
		actor: ownerActor(userId),
		action: 'auth.sign_in',
		metadata,
		origin: originOf(event)
	});
}

/** A failed attempt names no account: the typed identifier could hold a mistyped password. */
async function auditFailedSignIn(event: RequestEvent, method: string): Promise<void> {
	await recordAudit({
		actor: SYSTEM_ACTOR,
		action: 'auth.sign_in_failed',
		metadata: { method },
		origin: originOf(event)
	});
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
		let result: object;
		try {
			if (parsed.data.identifier.includes('@')) {
				result = await getAuth().api.signInEmail({
					body: { email: parsed.data.identifier, password },
					headers
				});
			} else {
				result = await getAuth().api.signInUsername({
					body: { username: parsed.data.identifier.toLowerCase(), password },
					headers
				});
			}
		} catch (cause) {
			if (isAPIError(cause)) {
				await auditFailedSignIn(event, 'password');
				return fail(
					401,
					loginState('password', identifier, false, m.login_error_credentials())
				);
			}
			throw cause;
		}
		if (needsSecondFactor(result)) {
			return twoFactorState('password');
		}
		const signedIn = (result as { user: { id: string; email: string } }).user;
		await auditSignIn(event, signedIn.id, { method: 'password' });
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

		let result: object;
		try {
			result = await getAuth().api.signInEmailOTP({
				body: { email: parsed.data.email, otp: parsed.data.code },
				headers: event.request.headers
			});
		} catch (cause) {
			if (isAPIError(cause)) {
				await auditFailedSignIn(event, 'email_code');
				return fail(401, loginState('code', email, true, m.login_error_code()));
			}
			throw cause;
		}
		if (needsSecondFactor(result)) {
			return twoFactorState('code');
		}
		const signedIn = (result as { user: { id: string; email: string } }).user;
		await auditSignIn(event, signedIn.id, { method: 'email_code' });
		await noteSignIn(event, signedIn);
		redirect(303, redirectTarget(data));
	},

	/** The second step: a TOTP code, or one of the backup codes, finishes the sign in. */
	secondFactor: async (event) => {
		const data = await event.request.formData();
		const method: LoginMethod = textValue(data, 'method') === 'code' ? 'code' : 'password';
		const kind: SecondFactor = textValue(data, 'kind') === 'backup' ? 'backup' : 'totp';

		if (isRateLimited(event, 'signIn')) {
			return fail(429, twoFactorState(method, m.error_rate_limited()));
		}

		const parsed = (kind === 'backup' ? backupCodeSchema : codeSchema).safeParse(
			textValue(data, 'code')
		);
		if (!parsed.success) {
			return fail(400, twoFactorState(method, '', { code: parsed.error.issues[0].message }));
		}

		const headers = event.request.headers;
		let signedIn: { id: string; email: string };
		try {
			const result =
				kind === 'backup'
					? await getAuth().api.verifyBackupCode({ body: { code: parsed.data }, headers })
					: await getAuth().api.verifyTOTP({ body: { code: parsed.data }, headers });
			signedIn = result.user;
		} catch (cause) {
			if (!isAPIError(cause)) {
				throw cause;
			}
			await auditFailedSignIn(event, kind === 'backup' ? 'backup_code' : 'totp');
			switch (errorCode(cause)) {
				case 'INVALID_TWO_FACTOR_COOKIE':
				case 'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE':
					return fail(
						401,
						loginState(method, '', false, m.login_error_two_factor_expired())
					);
				case 'ACCOUNT_TEMPORARILY_LOCKED':
					return fail(429, twoFactorState(method, m.login_error_two_factor_locked()));
				default:
					return fail(
						401,
						twoFactorState(method, '', { code: m.login_error_two_factor_code() })
					);
			}
		}
		await auditSignIn(event, signedIn.id, {
			method: method === 'code' ? 'email_code' : 'password',
			secondFactor: kind === 'backup' ? 'backup_code' : 'totp'
		});
		await noteSignIn(event, signedIn);
		redirect(303, redirectTarget(data));
	}
};
