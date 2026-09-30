import { createApiKey } from '$lib/server/api-keys';
import { handleApiRequest } from '$lib/server/api/router';
import { apiRoutes } from '$lib/server/api/routes';
import { getDb } from '$lib/server/db';
import { getEnv } from '$lib/server/env';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseVaultKey, unseal, VaultKeyError } from './crypto.server';
import { rotateVaultKey } from './rotation.server';
import { vaultSecret } from './schema.server';
import {
	createSecret,
	deleteSecret,
	getSecret,
	listSecrets,
	revealSecret,
	updateSecret
} from './vault.server';

const VALUE = 'hunter2-3f8a9c';

function secretInput(name: string, value = VALUE) {
	return { name, serviceUrl: 'https://mail.example.com', description: 'Mail account', value };
}

const NO_DETAILS = { serviceUrl: '', description: '' };

beforeEach(async () => {
	await getDb().delete(vaultSecret);
});

describe('vault', () => {
	it('stores values encrypted and reveals them on request', async () => {
		const created = await createSecret(secretInput('Mail'));
		expect(created).toMatchObject({ name: 'Mail', serviceUrl: 'https://mail.example.com' });
		expect(created).not.toHaveProperty('value');

		const [row] = await getDb()
			.select()
			.from(vaultSecret)
			.where(eq(vaultSecret.id, created.id));
		expect(row.ciphertext.toString('utf8')).not.toContain(VALUE);
		expect(row.lastRevealedAt).toBeNull();

		expect(await revealSecret(created.id)).toBe(VALUE);
		expect((await getSecret(created.id)).lastRevealedAt).not.toBeNull();
	});

	it('lists metadata by name without values', async () => {
		await createSecret(secretInput('zeta'));
		await createSecret(secretInput('Alpha'));
		const listed = await listSecrets();
		expect(listed.map((item) => item.name)).toEqual(['Alpha', 'zeta']);
		expect(JSON.stringify(listed)).not.toContain(VALUE);
	});

	it('changes metadata without touching the value, and the value when given', async () => {
		const created = await createSecret(secretInput('Mail'));
		await updateSecret(created.id, { name: 'Work mail', ...NO_DETAILS });
		expect(await getSecret(created.id)).toMatchObject({
			name: 'Work mail',
			serviceUrl: null,
			description: null
		});
		expect(await revealSecret(created.id)).toBe(VALUE);

		await updateSecret(created.id, { name: 'Work mail', ...NO_DETAILS }, 'new value');
		expect(await revealSecret(created.id)).toBe('new value');
	});

	it('validates input and deletes', async () => {
		await expect(createSecret({ ...secretInput(''), value: '' })).rejects.toSatisfy(
			(error) =>
				error instanceof ValidationError &&
				error.fields.name !== undefined &&
				error.fields.value !== undefined
		);
		await expect(
			createSecret({ ...secretInput('Bad'), serviceUrl: 'javascript:alert(1)' })
		).rejects.toBeInstanceOf(ValidationError);

		const created = await createSecret(secretInput('Temp'));
		await deleteSecret(created.id);
		await expect(getSecret(created.id)).rejects.toBeInstanceOf(NotFoundError);
	});
});

describe('API', () => {
	it('shows metadata only and has no way to write', async () => {
		const created = await createSecret(secretInput('Mail'));
		const { key } = await createApiKey({
			name: 'Vault',
			scopes: ['vault:read'],
			expiresAt: null
		});

		for (const path of ['/vault/secrets', `/vault/secrets/${created.id}`]) {
			const response = await handleApiRequest(
				new Request(`http://localhost/api/v1${path}`, {
					headers: { authorization: `Bearer ${key}` }
				}),
				{ origin: { ip: null, userAgent: null } }
			);
			expect(response.status).toBe(200);
			const text = await response.text();
			expect(text).toContain('Mail');
			expect(text).not.toContain(VALUE);
			expect(text).not.toMatch(/ciphertext|auth_tag|"iv"|"value"/);
		}

		const vaultRoutes = apiRoutes().filter((route) => route.path.startsWith('/vault'));
		expect(vaultRoutes.every((route) => route.method === 'GET')).toBe(true);
	});
});

describe('key rotation', () => {
	it('re-encrypts every value in one step and raises the key version', async () => {
		const oldKey = parseVaultKey(getEnv().ENCRYPTION_KEY);
		const newKey = randomBytes(32);
		const first = await createSecret(secretInput('One', 'first value'));
		const second = await createSecret(secretInput('Two', 'second value'));

		expect(await rotateVaultKey(getDb(), oldKey, newKey)).toEqual({ count: 2, keyVersion: 2 });

		const rows = await getDb().select().from(vaultSecret);
		for (const row of rows) {
			expect(row.keyVersion).toBe(2);
			expect(() => unseal(row, row.id, oldKey)).toThrow();
		}
		const opened = new Map(rows.map((row) => [row.id, unseal(row, row.id, newKey)]));
		expect(opened.get(first.id)).toBe('first value');
		expect(opened.get(second.id)).toBe('second value');

		// Back to the configured key, for the other tests.
		await rotateVaultKey(getDb(), newKey, oldKey);
		expect(await revealSecret(first.id)).toBe('first value');
	});

	it('changes nothing when the old key does not open every value', async () => {
		const created = await createSecret(secretInput('One'));
		const before = await getDb().select().from(vaultSecret);

		await expect(
			rotateVaultKey(getDb(), randomBytes(32), randomBytes(32))
		).rejects.toBeInstanceOf(VaultKeyError);

		const after = await getDb().select().from(vaultSecret);
		expect(after).toEqual(before);
		expect(await revealSecret(created.id)).toBe(VALUE);
	});
});
