import { allScopeIds } from '$lib/modules/scopes';
import {
	apiKeysWithCopy,
	deleteApiKeyCopy,
	storeApiKeyCopy,
	VAULT_MODULE
} from '$lib/modules/vault/vault.server';
import { m } from '$lib/paraglide/messages.js';
import { apiKeyCreateSchema } from '$lib/schemas/api-keys';
import { ownerActor } from '$lib/server/actor';
import { createApiKey, listApiKeys, revokeApiKey } from '$lib/server/api-keys';
import { originOf, recordAudit } from '$lib/server/audit';
import { getDb } from '$lib/server/db';
import { NotFoundError } from '$lib/server/errors';
import { requireUser } from '$lib/server/guard';
import { isSteppedUp, stepUpRequired } from '$lib/server/step-up';
import { isUuid } from '$lib/utils/uuid';
import { fieldErrors, textValue } from '$lib/utils/validation';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const DAY_MS = 24 * 60 * 60 * 1000;

export const load: PageServerLoad = async ({ locals }) => {
	requireUser(locals);
	const [keys, copies] = await Promise.all([listApiKeys(), apiKeysWithCopy()]);
	return { keys, copies };
};

/** A key with an expiry date works until the end of that day, UTC. */
function expiryOf(date: string): Date | null {
	if (date === '') {
		return null;
	}
	return new Date(new Date(`${date}T00:00:00Z`).getTime() + DAY_MS);
}

export const actions = {
	create: async (event) => {
		const { user, session } = requireUser(event.locals);
		if (!(await isSteppedUp(session.id))) {
			return stepUpRequired();
		}
		const data = await event.request.formData();
		const parsed = apiKeyCreateSchema.safeParse({
			name: textValue(data, 'name'),
			scopes: data.getAll('scopes').filter((value) => typeof value === 'string'),
			expires: textValue(data, 'expires'),
			vault: textValue(data, 'vault') === 'on'
		});
		if (!parsed.success) {
			return fail(400, { form: 'create', errors: fieldErrors(parsed.error), key: null });
		}
		const known = new Set(allScopeIds());
		if (!parsed.data.scopes.every((scope) => known.has(scope))) {
			return fail(400, {
				form: 'create',
				errors: { scopes: m.api_keys_error_scopes() },
				key: null
			});
		}
		const expiresAt = expiryOf(parsed.data.expires);
		if (expiresAt !== null && expiresAt <= new Date()) {
			return fail(400, {
				form: 'create',
				errors: { expires: m.api_keys_error_expiry() },
				key: null
			});
		}

		const { created, copy } = await getDb().transaction(async (tx) => {
			const key = await createApiKey(
				{ name: parsed.data.name, scopes: parsed.data.scopes, expiresAt },
				tx
			);
			if (!parsed.data.vault) {
				return { created: key, copy: null };
			}
			const stored = await storeApiKeyCopy(tx, {
				apiKeyId: key.view.id,
				keyName: key.view.name,
				key: key.key,
				scopes: key.view.scopes
			});
			return { created: key, copy: stored };
		});
		await recordAudit({
			actor: ownerActor(user.id),
			action: 'api_key.create',
			target: { type: 'api_key', id: created.view.id },
			metadata: { name: created.view.name, scopes: created.view.scopes },
			origin: originOf(event)
		});
		if (copy !== null) {
			await recordAudit({
				actor: ownerActor(user.id),
				action: `${VAULT_MODULE}.create`,
				target: { type: 'vault_secret', id: copy.id },
				metadata: { apiKeyId: created.view.id },
				origin: originOf(event)
			});
		}
		return { form: 'create', errors: {}, key: created.key, vault: copy !== null };
	},

	revoke: async (event) => {
		const { user } = requireUser(event.locals);
		const data = await event.request.formData();
		const id = textValue(data, 'id');
		try {
			if (!isUuid(id)) {
				throw new NotFoundError('API key');
			}
			// The key and its copy in the vault go together: a copy of a revoked key is useless.
			const { revoked, copy } = await getDb().transaction(async (tx) => {
				const key = await revokeApiKey(id, new Date(), tx);
				return { revoked: key, copy: await deleteApiKeyCopy(tx, key.id) };
			});
			await recordAudit({
				actor: ownerActor(user.id),
				action: 'api_key.revoke',
				target: { type: 'api_key', id: revoked.id },
				metadata: { name: revoked.name },
				origin: originOf(event)
			});
			if (copy !== null) {
				await recordAudit({
					actor: ownerActor(user.id),
					action: `${VAULT_MODULE}.delete`,
					target: { type: 'vault_secret', id: copy.id },
					metadata: { apiKeyId: revoked.id },
					origin: originOf(event)
				});
				return { form: 'revoke', message: m.api_keys_revoked_copy() };
			}
		} catch (cause) {
			if (cause instanceof NotFoundError) {
				return fail(404, { form: 'revoke', message: m.api_keys_error_missing() });
			}
			throw cause;
		}
		return { form: 'revoke', message: m.api_keys_revoked() };
	}
} satisfies Actions;
