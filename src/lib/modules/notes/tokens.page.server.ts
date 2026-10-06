import { m } from '$lib/paraglide/messages.js';
import { localizeHref } from '$lib/paraglide/runtime.js';
import { endOfUtcDay } from '$lib/schemas/rules';
import { ownerActor } from '$lib/server/actor';
import { originOf, recordAudit } from '$lib/server/audit';
import { getEnv } from '$lib/server/env';
import { NotFoundError } from '$lib/server/errors';
import { requireUser } from '$lib/server/guard';
import { isSteppedUp, stepUpRequired } from '$lib/server/step-up';
import type { FieldErrors } from '$lib/types/validation';
import { fieldErrors, textValue } from '$lib/utils/validation';
import { error, fail, type RequestEvent } from '@sveltejs/kit';
import { noteTokenCreateSchema } from './schemas';
import { createNoteToken, deleteNoteToken, revokeNoteToken } from './tokens.server';

// The owner's actions on note tokens: creating one on the note page, after a step-up like an API
// key, and revoking or deleting under Settings, API Keys.

/** The share link: the token rides in the fragment, which browsers never send to a server. */
export function shareLink(token: string): string {
	return `${getEnv().ORIGIN}${localizeHref('/shared')}#${token}`;
}

function createFailure(errors: FieldErrors) {
	return fail(400, { form: 'token', errors, token: null, link: null });
}

/** `?/createToken` of the note page. */
export async function createNoteTokenAction(event: RequestEvent) {
	const { user, session } = requireUser(event.locals);
	if (!(await isSteppedUp(session.id))) {
		return stepUpRequired();
	}
	const data = await event.request.formData();
	const parsed = noteTokenCreateSchema.safeParse({
		name: textValue(data, 'name'),
		access: textValue(data, 'access'),
		expires: textValue(data, 'expires')
	});
	if (!parsed.success) {
		return createFailure(fieldErrors(parsed.error));
	}
	const expiresAt = endOfUtcDay(parsed.data.expires);
	if (expiresAt <= new Date()) {
		return createFailure({ expires: m.note_tokens_error_expiry() });
	}

	try {
		const created = await createNoteToken({
			noteId: event.params.id ?? '',
			name: parsed.data.name,
			access: parsed.data.access,
			expiresAt
		});
		await recordAudit({
			actor: ownerActor(user.id),
			action: 'note_token.create',
			target: { type: 'note_token', id: created.view.id },
			metadata: {
				noteId: created.view.noteId,
				name: created.view.name,
				access: created.view.access
			},
			origin: originOf(event)
		});
		return { form: 'token', errors: {}, token: created.token, link: shareLink(created.token) };
	} catch (cause) {
		if (cause instanceof NotFoundError) {
			error(404);
		}
		throw cause;
	}
}

/** Revoke and delete under Settings, API Keys. */
export const noteTokenSettingsActions = {
	revokeNoteToken: async (event: RequestEvent) => {
		const { user } = requireUser(event.locals);
		const data = await event.request.formData();
		try {
			const revoked = await revokeNoteToken(textValue(data, 'id'));
			await recordAudit({
				actor: ownerActor(user.id),
				action: 'note_token.revoke',
				target: { type: 'note_token', id: revoked.id },
				metadata: { noteId: revoked.noteId, name: revoked.name },
				origin: originOf(event)
			});
		} catch (cause) {
			if (cause instanceof NotFoundError) {
				return fail(404, { form: 'noteToken', message: m.note_tokens_error_missing() });
			}
			throw cause;
		}
		return { form: 'noteToken', message: m.note_tokens_revoked() };
	},

	deleteNoteToken: async (event: RequestEvent) => {
		const { user } = requireUser(event.locals);
		const data = await event.request.formData();
		try {
			const deleted = await deleteNoteToken(textValue(data, 'id'));
			await recordAudit({
				actor: ownerActor(user.id),
				action: 'note_token.delete',
				target: { type: 'note_token', id: deleted.id },
				metadata: { noteId: deleted.noteId, name: deleted.name },
				origin: originOf(event)
			});
		} catch (cause) {
			if (cause instanceof NotFoundError) {
				return fail(404, { form: 'noteToken', message: m.note_tokens_error_missing() });
			}
			throw cause;
		}
		return { form: 'noteToken', message: m.note_tokens_deleted() };
	}
};
