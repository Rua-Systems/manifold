import { m } from '$lib/paraglide/messages.js';
import { getDb, type Database, type Transaction } from '$lib/server/db';
import { getEnv } from '$lib/server/env';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { isUuid } from '$lib/utils/uuid';
import { fieldErrors } from '$lib/utils/validation';
import { containsPattern } from '$lib/server/search-query';
import { asc, desc, eq, ilike, isNotNull, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { parseVaultKey, seal, unseal } from './crypto.server';
import { vaultSecret } from './schema.server';
import {
	SECRET_DESCRIPTION_MAX_LENGTH,
	SECRET_NAME_MAX_LENGTH,
	secretCreateSchema,
	secretMetadataSchema,
	secretValueSchema
} from './schemas';
import type { VaultSecretView } from './types';

export const VAULT_MODULE = 'vault';

// Values only ever leave this module through `revealSecret`, which the page calls after a
// step-up. Everything else, the API and MCP included, sees metadata.

const viewColumns = {
	id: vaultSecret.id,
	name: vaultSecret.name,
	serviceUrl: vaultSecret.serviceUrl,
	description: vaultSecret.description,
	lastRevealedAt: vaultSecret.lastRevealedAt,
	apiKeyId: vaultSecret.apiKeyId,
	createdAt: vaultSecret.createdAt,
	updatedAt: vaultSecret.updatedAt
};

function vaultKey(): Buffer {
	return parseVaultKey(getEnv().ENCRYPTION_KEY);
}

function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
	const parsed = schema.safeParse(input);
	if (!parsed.success) {
		throw new ValidationError(fieldErrors(parsed.error));
	}
	return parsed.data;
}

/** The version new values are sealed under: the one the last rotation reached. */
async function currentKeyVersion(db: Database | Transaction = getDb()): Promise<number> {
	const [row] = await db
		.select({ version: sql<number>`coalesce(max(${vaultSecret.keyVersion}), 1)::int` })
		.from(vaultSecret);
	return row.version;
}

export async function listSecrets(): Promise<VaultSecretView[]> {
	return getDb()
		.select(viewColumns)
		.from(vaultSecret)
		.orderBy(asc(sql`lower(${vaultSecret.name})`), asc(vaultSecret.id));
}

export async function getSecret(id: string): Promise<VaultSecretView> {
	if (!isUuid(id)) {
		throw new NotFoundError('Secret');
	}
	const [row] = await getDb()
		.select(viewColumns)
		.from(vaultSecret)
		.where(eq(vaultSecret.id, id))
		.limit(1);
	if (row === undefined) {
		throw new NotFoundError('Secret');
	}
	return row;
}

export async function createSecret(input: unknown): Promise<VaultSecretView> {
	const data = parse(secretCreateSchema, input);
	const id = randomUUID();
	const [created] = await getDb()
		.insert(vaultSecret)
		.values({
			id,
			name: data.name,
			serviceUrl: data.serviceUrl,
			description: data.description,
			...seal(data.value, id, vaultKey()),
			keyVersion: await currentKeyVersion()
		})
		.returning(viewColumns);
	return created;
}

/** Changes the metadata, and the value when `value` is given. */
export async function updateSecret(
	id: string,
	input: unknown,
	value?: string
): Promise<VaultSecretView> {
	const current = await getSecret(id);
	const data = parse(secretMetadataSchema, input);
	const sealed =
		value === undefined
			? {}
			: {
					...seal(parse(secretValueSchema, value), current.id, vaultKey()),
					keyVersion: await currentKeyVersion()
				};
	const [updated] = await getDb()
		.update(vaultSecret)
		.set({ ...data, ...sealed, updatedAt: new Date() })
		.where(eq(vaultSecret.id, current.id))
		.returning(viewColumns);
	return updated;
}

export async function deleteSecret(id: string): Promise<VaultSecretView> {
	const current = await getSecret(id);
	await getDb().delete(vaultSecret).where(eq(vaultSecret.id, current.id));
	return current;
}

/** Cuts a text to a column's limit, counting characters as the database does. */
function clip(text: string, max: number): string {
	return Array.from(text).slice(0, max).join('');
}

/** A new API key, as its copy in the vault records it. */
export interface ApiKeyCopy {
	apiKeyId: string;
	keyName: string;
	key: string;
	scopes: string[];
}

/**
 * Saves the copy of a new API key, inside the transaction that creates the key: the key and its
 * copy exist together or not at all. The entry is named after the key and points at this app.
 */
export async function storeApiKeyCopy(tx: Transaction, copy: ApiKeyCopy): Promise<VaultSecretView> {
	const id = randomUUID();
	const [created] = await tx
		.insert(vaultSecret)
		.values({
			id,
			name: clip(m.vault_api_key_name({ name: copy.keyName }), SECRET_NAME_MAX_LENGTH),
			serviceUrl: getEnv().ORIGIN,
			description: clip(
				m.vault_api_key_description({ scopes: copy.scopes.join(', ') }),
				SECRET_DESCRIPTION_MAX_LENGTH
			),
			...seal(copy.key, id, vaultKey()),
			keyVersion: await currentKeyVersion(tx),
			apiKeyId: copy.apiKeyId
		})
		.returning(viewColumns);
	return created;
}

/** Deletes the copy of an API key, inside the transaction that revokes it; null without one. */
export async function deleteApiKeyCopy(
	tx: Transaction,
	apiKeyId: string
): Promise<VaultSecretView | null> {
	const [deleted] = await tx
		.delete(vaultSecret)
		.where(eq(vaultSecret.apiKeyId, apiKeyId))
		.returning(viewColumns);
	return deleted ?? null;
}

/** The API keys that have a copy in the vault. */
export async function apiKeysWithCopy(): Promise<string[]> {
	const rows = await getDb()
		.select({ apiKeyId: vaultSecret.apiKeyId })
		.from(vaultSecret)
		.where(isNotNull(vaultSecret.apiKeyId));
	return rows.map((row) => row.apiKeyId).filter((id): id is string => id !== null);
}

/** Decrypts a value for the owner and notes when it was last shown. */
export async function revealSecret(id: string, now = new Date()): Promise<string> {
	if (!isUuid(id)) {
		throw new NotFoundError('Secret');
	}
	const [row] = await getDb().select().from(vaultSecret).where(eq(vaultSecret.id, id)).limit(1);
	if (row === undefined) {
		throw new NotFoundError('Secret');
	}
	const value = unseal(row, row.id, vaultKey());
	await getDb()
		.update(vaultSecret)
		.set({ lastRevealedAt: now })
		.where(eq(vaultSecret.id, row.id));
	return value;
}

/** Secrets whose name or address matches the query: metadata only, never values. */
export async function searchSecrets(
	query: string,
	limit: number
): Promise<(VaultSecretView & { score: number })[]> {
	const pattern = containsPattern(query);
	const score = sql<number>`greatest(
		similarity(${vaultSecret.name}, ${query}),
		word_similarity(${query}, ${vaultSecret.name}),
		case when ${vaultSecret.name} ilike ${pattern} then 0.9 else 0 end
	)::float8`;
	const rows = await getDb()
		.select({ ...viewColumns, score })
		.from(vaultSecret)
		.where(
			or(
				ilike(vaultSecret.name, pattern),
				ilike(vaultSecret.serviceUrl, pattern),
				sql`${vaultSecret.name} % ${query}`,
				sql`${query} <% ${vaultSecret.name}`
			)
		)
		.orderBy(desc(score), asc(vaultSecret.name))
		.limit(limit);
	return rows.map((row) => ({ ...row, score: Number(row.score) }));
}
