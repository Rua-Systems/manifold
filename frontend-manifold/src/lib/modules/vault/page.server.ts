import { m } from '$lib/paraglide/messages.js';
import { ownerActor } from '$lib/server/actor';
import { originOf, recordAudit } from '$lib/server/audit';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { requireUser } from '$lib/server/guard';
import { isSteppedUp, stepUpRequired } from '$lib/server/step-up';
import { textValue } from '$lib/utils/validation';
import { error, fail, type RequestEvent } from '@sveltejs/kit';
import {
	createSecret,
	deleteSecret,
	listSecrets,
	revealSecret,
	updateSecret,
	VAULT_MODULE
} from './vault.server';

// Load and form actions behind /vault. Revealing, copying and changing a value need a step-up;
// every action is recorded in the audit log, never with the value.

export async function loadVault() {
	return { secrets: await listSecrets() };
}

function metadataOf(data: FormData) {
	return {
		name: textValue(data, 'name'),
		serviceUrl: textValue(data, 'serviceUrl'),
		description: textValue(data, 'description')
	};
}

async function audit(event: RequestEvent, userId: string, action: string, id: string) {
	await recordAudit({
		actor: ownerActor(userId),
		action: `${VAULT_MODULE}.${action}`,
		target: { type: 'vault_secret', id },
		origin: originOf(event)
	});
}

export const vaultActions = {
	create: async (event: RequestEvent) => {
		const { user } = requireUser(event.locals);
		const data = await event.request.formData();
		try {
			const created = await createSecret({
				...metadataOf(data),
				value: textValue(data, 'value')
			});
			await audit(event, user.id, 'create', created.id);
		} catch (cause) {
			if (cause instanceof ValidationError) {
				return fail(400, {
					form: 'create',
					success: false,
					message: '',
					errors: cause.fields
				});
			}
			throw cause;
		}
		return { form: 'create', success: true, message: m.vault_created(), errors: {} };
	},

	update: async (event: RequestEvent) => {
		const { user, session } = requireUser(event.locals);
		const data = await event.request.formData();
		const value = textValue(data, 'value');
		// Changing the value is sensitive; the name and notes are not.
		if (value !== '' && !(await isSteppedUp(session.id))) {
			return stepUpRequired();
		}
		const id = textValue(data, 'id');
		try {
			await updateSecret(id, metadataOf(data), value === '' ? undefined : value);
			await audit(event, user.id, value === '' ? 'update' : 'update_value', id);
		} catch (cause) {
			if (cause instanceof ValidationError) {
				return fail(400, {
					form: 'update',
					success: false,
					message: '',
					errors: cause.fields
				});
			}
			if (cause instanceof NotFoundError) {
				error(404);
			}
			throw cause;
		}
		return { form: 'update', success: true, message: m.vault_updated(), errors: {} };
	},

	delete: async (event: RequestEvent) => {
		const { user } = requireUser(event.locals);
		const data = await event.request.formData();
		try {
			const deleted = await deleteSecret(textValue(data, 'id'));
			await audit(event, user.id, 'delete', deleted.id);
		} catch (cause) {
			if (cause instanceof NotFoundError) {
				return fail(404, {
					form: 'delete',
					success: false,
					message: m.vault_error_missing()
				});
			}
			throw cause;
		}
		return { form: 'delete', success: true, message: m.vault_deleted() };
	},

	/** The value, for the page to show for 30 seconds or to put on the clipboard. */
	reveal: async (event: RequestEvent) => {
		const { user, session } = requireUser(event.locals);
		if (!(await isSteppedUp(session.id))) {
			return stepUpRequired();
		}
		const data = await event.request.formData();
		const id = textValue(data, 'id');
		const purpose = textValue(data, 'purpose') === 'copy' ? 'copy' : 'reveal';
		try {
			const value = await revealSecret(id);
			await audit(event, user.id, purpose, id);
			return { form: 'reveal', id, value };
		} catch (cause) {
			if (cause instanceof NotFoundError) {
				return fail(404, { message: m.vault_error_missing() });
			}
			throw cause;
		}
	}
};
