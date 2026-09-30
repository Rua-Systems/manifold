import { m } from '$lib/paraglide/messages.js';
import { emailChangeSchema, passwordChangeSchema, profileSchema } from '$lib/schemas/auth';
import { preferencesSchema } from '$lib/schemas/security';
import { changeEmail } from '$lib/server/account';
import { ownerActor } from '$lib/server/actor';
import { originOf, recordAudit } from '$lib/server/audit';
import { getAuth } from '$lib/server/auth';
import { requireUser } from '$lib/server/guard';
import { notePasswordChanged } from '$lib/server/notices';
import { isSteppedUp } from '$lib/server/step-up';
import { getUserSettings, saveUserSettings } from '$lib/server/user-settings';
import type { SettingsForm, SettingsFormState } from '$lib/types/settings';
import type { FieldErrors } from '$lib/types/validation';
import { fieldErrors, textValue } from '$lib/utils/validation';
import { fail } from '@sveltejs/kit';
import { isAPIError } from 'better-auth/api';
import type { Actions, PageServerLoad } from './$types';

function formState(
	form: SettingsForm,
	success: boolean,
	message = '',
	errors: FieldErrors = {}
): SettingsFormState {
	return { form, success, message, errors };
}

/** Email and password changes need a recent step-up; the page asks for it and tries again. */
function stepUpState(form: SettingsForm): SettingsFormState {
	return { form, success: false, message: m.step_up_required(), errors: {}, stepUp: true };
}

export const load: PageServerLoad = async ({ locals }) => {
	const { user } = requireUser(locals);
	return { preferences: await getUserSettings(user.id) };
};

function errorCode(cause: unknown): string {
	if (isAPIError(cause)) {
		const body: unknown = cause.body;
		if (typeof body === 'object' && body !== null && 'code' in body) {
			return String(body.code);
		}
	}
	return '';
}

export const actions: Actions = {
	profile: async ({ request, locals }) => {
		requireUser(locals);
		const data = await request.formData();
		const parsed = profileSchema.safeParse({
			name: textValue(data, 'name'),
			username: textValue(data, 'username')
		});
		if (!parsed.success) {
			return fail(400, formState('profile', false, '', fieldErrors(parsed.error)));
		}

		try {
			await getAuth().api.updateUser({ body: parsed.data, headers: request.headers });
		} catch (cause) {
			if (errorCode(cause) === 'USERNAME_IS_ALREADY_TAKEN') {
				return fail(
					400,
					formState('profile', false, '', { username: m.settings_error_username_taken() })
				);
			}
			if (isAPIError(cause)) {
				return fail(400, formState('profile', false, m.settings_error_generic()));
			}
			throw cause;
		}
		return formState('profile', true, m.settings_profile_saved());
	},

	preferences: async ({ request, locals }) => {
		const { user } = requireUser(locals);
		const data = await request.formData();
		const parsed = preferencesSchema.safeParse({
			locale: textValue(data, 'locale'),
			theme: textValue(data, 'theme')
		});
		if (!parsed.success) {
			return fail(400, formState('preferences', false, '', fieldErrors(parsed.error)));
		}
		await saveUserSettings(user.id, {
			locale: parsed.data.locale === '' ? null : parsed.data.locale,
			theme: parsed.data.theme === '' ? null : parsed.data.theme
		});
		return formState('preferences', true, m.settings_preferences_saved());
	},

	email: async (event) => {
		const { request, locals } = event;
		const { user, session } = requireUser(locals);
		if (!(await isSteppedUp(session.id))) {
			return fail(403, stepUpState('email'));
		}
		const data = await request.formData();
		const parsed = emailChangeSchema.safeParse({ email: textValue(data, 'email') });
		if (!parsed.success) {
			return fail(400, formState('email', false, '', fieldErrors(parsed.error)));
		}

		if ((await changeEmail(user.id, parsed.data.email)) === 'taken') {
			return fail(
				400,
				formState('email', false, '', { email: m.settings_error_email_taken() })
			);
		}
		await recordAudit({
			actor: ownerActor(user.id),
			action: 'auth.email_change',
			origin: originOf(event)
		});
		return formState('email', true, m.settings_email_saved());
	},

	password: async (event) => {
		const { request, locals } = event;
		const { user, session } = requireUser(locals);
		if (!(await isSteppedUp(session.id))) {
			return fail(403, stepUpState('password'));
		}
		const data = await request.formData();
		const parsed = passwordChangeSchema.safeParse({
			currentPassword: textValue(data, 'currentPassword'),
			password: textValue(data, 'password'),
			confirmPassword: textValue(data, 'confirmPassword')
		});
		if (!parsed.success) {
			return fail(400, formState('password', false, '', fieldErrors(parsed.error)));
		}

		try {
			await getAuth().api.changePassword({
				body: {
					currentPassword: parsed.data.currentPassword,
					newPassword: parsed.data.password,
					revokeOtherSessions: true
				},
				headers: request.headers
			});
		} catch (cause) {
			if (errorCode(cause) === 'INVALID_PASSWORD') {
				return fail(
					400,
					formState('password', false, '', {
						currentPassword: m.settings_error_current_password()
					})
				);
			}
			if (isAPIError(cause)) {
				return fail(400, formState('password', false, m.settings_error_generic()));
			}
			throw cause;
		}
		await recordAudit({
			actor: ownerActor(user.id),
			action: 'auth.password_change',
			origin: originOf(event)
		});
		await notePasswordChanged(event, user.email);
		return formState('password', true, m.settings_password_saved());
	}
};
