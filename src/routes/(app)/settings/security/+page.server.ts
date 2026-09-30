import { m } from '$lib/paraglide/messages.js';
import { codeSchema, passwordSchema } from '$lib/schemas/auth';
import { auditFilterSchema, twoFactorCredentialsSchema } from '$lib/schemas/security';
import { ownerActor } from '$lib/server/actor';
import { AUDIT_PAGE_SIZE, listAuditEvents, originOf, recordAudit } from '$lib/server/audit';
import { requireUser } from '$lib/server/guard';
import { countFailedCredentialCheck, isCredentialCheckBlocked } from '$lib/server/rate-limit';
import { listSessions, revokeOtherSessions, revokeSession } from '$lib/server/sessions';
import { isSteppedUp } from '$lib/server/step-up';
import {
	confirmSetup,
	disable,
	qrCodeImage,
	regenerateBackupCodes,
	startSetup,
	totpSecret,
	type TwoFactorProblem
} from '$lib/server/two-factor';
import type { SecurityFormState, TwoFactorSetup } from '$lib/types/security';
import type { FieldErrors } from '$lib/types/validation';
import { fieldErrors, textValue } from '$lib/utils/validation';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

/** The last millisecond of a `YYYY-MM-DD` day in UTC, so a range includes its end day. */
function endOfDay(date: string): Date {
	return new Date(`${date}T23:59:59.999Z`);
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const { user, session } = requireUser(locals);
	const filter = auditFilterSchema.parse(Object.fromEntries(url.searchParams));
	const { events, total } = await listAuditEvents({
		actorType: filter.actor,
		actionPrefix: filter.action,
		from: filter.from === undefined ? undefined : new Date(`${filter.from}T00:00:00Z`),
		to: filter.to === undefined ? undefined : endOfDay(filter.to),
		page: filter.page
	});

	return {
		twoFactorEnabled: user.twoFactorEnabled === true,
		sessions: await listSessions(user.id, session.id),
		audit: {
			events,
			total,
			page: filter.page ?? 1,
			pageSize: AUDIT_PAGE_SIZE,
			filter: {
				actor: filter.actor ?? '',
				action: filter.action ?? '',
				from: filter.from ?? '',
				to: filter.to ?? ''
			}
		}
	};
};

function problemErrors(problem: TwoFactorProblem): FieldErrors {
	if (problem === 'wrong_password') {
		return { password: m.settings_error_current_password() };
	}
	return { code: m.security_error_code() };
}

/** A form refused because the account entered too many wrong passwords or codes lately. */
function blocked(form: 'twoFactorStart' | 'twoFactorDisable' | 'backupCodesRegenerate') {
	return fail(429, {
		form,
		errors: {},
		message: m.error_rate_limited()
	} satisfies SecurityFormState);
}

/** Ending sessions needs a recent step-up; the page asks for it and sends the form again. */
function sessionsStepUp() {
	return fail(403, {
		form: 'sessions',
		stepUp: true,
		message: m.step_up_required()
	} satisfies SecurityFormState);
}

/** A setup the page sent back, shown again after a wrong code. Only its QR image is rebuilt. */
async function setupFrom(totpUri: string): Promise<TwoFactorSetup | null> {
	if (!totpUri.startsWith('otpauth://totp/') || totpUri.length > 1024) {
		return null;
	}
	return { totpUri, secret: totpSecret(totpUri), qr: await qrCodeImage(totpUri) };
}

export const actions = {
	startTwoFactor: async (event) => {
		const { user } = requireUser(event.locals);
		if (isCredentialCheckBlocked(user.id)) {
			return blocked('twoFactorStart');
		}
		const data = await event.request.formData();
		const password = passwordSchema.safeParse(textValue(data, 'password'));
		if (!password.success) {
			return fail(400, {
				form: 'twoFactorStart',
				errors: { password: password.error.issues[0].message },
				message: ''
			} satisfies SecurityFormState);
		}

		const started = await startSetup(event, password.data);
		if (typeof started === 'string') {
			countFailedCredentialCheck(user.id);
			return fail(400, {
				form: 'twoFactorStart',
				errors: problemErrors(started),
				message: ''
			} satisfies SecurityFormState);
		}
		const setup = await setupFrom(started.totpUri);
		if (setup === null) {
			throw new Error('Better Auth answered an unexpected TOTP address.');
		}
		return {
			form: 'twoFactorSetup',
			errors: {},
			message: '',
			...setup
		} satisfies SecurityFormState;
	},

	confirmTwoFactor: async (event) => {
		const signedIn = requireUser(event.locals);
		if (isCredentialCheckBlocked(signedIn.user.id)) {
			return blocked('twoFactorStart');
		}
		const data = await event.request.formData();
		const setup = await setupFrom(textValue(data, 'totpUri'));
		const code = codeSchema.safeParse(textValue(data, 'code'));
		if (setup === null) {
			return fail(400, {
				form: 'twoFactorStart',
				errors: {},
				message: m.security_error_setup()
			} satisfies SecurityFormState);
		}
		if (!code.success) {
			return fail(400, {
				form: 'twoFactorSetup',
				errors: { code: code.error.issues[0].message },
				message: '',
				...setup
			} satisfies SecurityFormState);
		}

		const confirmed = await confirmSetup(event, signedIn, code.data);
		if (typeof confirmed === 'string') {
			countFailedCredentialCheck(signedIn.user.id);
			return fail(400, {
				form: 'twoFactorSetup',
				errors: problemErrors(confirmed),
				message: '',
				...setup
			} satisfies SecurityFormState);
		}
		return {
			form: 'backupCodes',
			backupCodes: confirmed.backupCodes,
			message: m.security_two_factor_enabled()
		} satisfies SecurityFormState;
	},

	disableTwoFactor: async (event) => {
		const signedIn = requireUser(event.locals);
		if (isCredentialCheckBlocked(signedIn.user.id)) {
			return blocked('twoFactorDisable');
		}
		const data = await event.request.formData();
		const parsed = twoFactorCredentialsSchema.safeParse({
			password: textValue(data, 'password'),
			code: textValue(data, 'code')
		});
		if (!parsed.success) {
			return fail(400, {
				form: 'twoFactorDisable',
				errors: fieldErrors(parsed.error),
				message: ''
			} satisfies SecurityFormState);
		}

		const result = await disable(event, signedIn, parsed.data);
		if (result !== 'disabled') {
			countFailedCredentialCheck(signedIn.user.id);
			return fail(400, {
				form: 'twoFactorDisable',
				errors: problemErrors(result),
				message: ''
			} satisfies SecurityFormState);
		}
		return {
			form: 'twoFactorDisable',
			errors: {},
			message: m.security_two_factor_disabled()
		} satisfies SecurityFormState;
	},

	regenerateBackupCodes: async (event) => {
		const signedIn = requireUser(event.locals);
		if (isCredentialCheckBlocked(signedIn.user.id)) {
			return blocked('backupCodesRegenerate');
		}
		const data = await event.request.formData();
		const parsed = twoFactorCredentialsSchema.safeParse({
			password: textValue(data, 'password'),
			code: textValue(data, 'code')
		});
		if (!parsed.success) {
			return fail(400, {
				form: 'backupCodesRegenerate',
				errors: fieldErrors(parsed.error),
				message: ''
			} satisfies SecurityFormState);
		}

		const result = await regenerateBackupCodes(event, signedIn, parsed.data);
		if (typeof result === 'string') {
			countFailedCredentialCheck(signedIn.user.id);
			return fail(400, {
				form: 'backupCodesRegenerate',
				errors: problemErrors(result),
				message: ''
			} satisfies SecurityFormState);
		}
		return {
			form: 'backupCodes',
			backupCodes: result.backupCodes,
			message: m.security_backup_codes_created()
		} satisfies SecurityFormState;
	},

	revokeSession: async (event) => {
		const { user, session } = requireUser(event.locals);
		if (!(await isSteppedUp(session.id))) {
			return sessionsStepUp();
		}
		const data = await event.request.formData();
		const id = textValue(data, 'id');
		if (id === session.id || !(await revokeSession(user.id, id))) {
			return fail(404, {
				form: 'sessions',
				message: m.security_error_session()
			} satisfies SecurityFormState);
		}
		await recordAudit({
			actor: ownerActor(user.id),
			action: 'auth.session_revoke',
			target: { type: 'session', id },
			origin: originOf(event)
		});
		return {
			form: 'sessions',
			message: m.security_session_revoked()
		} satisfies SecurityFormState;
	},

	revokeOtherSessions: async (event) => {
		const { user, session } = requireUser(event.locals);
		if (!(await isSteppedUp(session.id))) {
			return sessionsStepUp();
		}
		const count = await revokeOtherSessions(user.id, session.id);
		await recordAudit({
			actor: ownerActor(user.id),
			action: 'auth.sessions_revoke_others',
			metadata: { count },
			origin: originOf(event)
		});
		return {
			form: 'sessions',
			message: m.security_sessions_revoked({ count })
		} satisfies SecurityFormState;
	}
} satisfies Actions;
