import { and, desc, eq } from 'drizzle-orm';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { getDb, type Database, type Transaction } from './db';
import { apiKey } from './db/schema';
import { NotFoundError } from './errors';
import type { ApiKeyView } from '$lib/types/api-keys';

// API keys: `mfd_<8 character prefix>_<32 random bytes, base64url>`. The prefix finds the row; only
// a SHA-256 hash of the whole key is stored, and hashes are compared in constant time. The key
// itself is shown once, when it is created.

const KEY_PATTERN = /^mfd_([a-z0-9]{8})_([A-Za-z0-9_-]{43})$/;
const PREFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const PREFIX_LENGTH = 8;

/** What a request authenticated by a key knows about it. */
export interface ApiKeyIdentity {
	id: string;
	name: string;
	scopes: string[];
	expiresAt: Date | null;
}

function hashKey(key: string): string {
	return createHash('sha256').update(key).digest('hex');
}

function newPrefix(): string {
	let prefix = '';
	for (let index = 0; index < PREFIX_LENGTH; index += 1) {
		prefix += PREFIX_ALPHABET[randomInt(PREFIX_ALPHABET.length)];
	}
	return prefix;
}

const viewColumns = {
	id: apiKey.id,
	name: apiKey.name,
	prefix: apiKey.prefix,
	scopes: apiKey.scopes,
	expiresAt: apiKey.expiresAt,
	lastUsedAt: apiKey.lastUsedAt,
	lastUsedIp: apiKey.lastUsedIp,
	revokedAt: apiKey.revokedAt,
	createdAt: apiKey.createdAt
};

/**
 * Creates a key and answers it in full; this is the only time the full key exists. Pass a
 * transaction to create it together with other rows, such as its copy in the vault.
 */
export async function createApiKey(
	input: {
		name: string;
		scopes: string[];
		expiresAt: Date | null;
	},
	db: Database | Transaction = getDb()
): Promise<{ key: string; view: ApiKeyView }> {
	const prefix = newPrefix();
	const key = `mfd_${prefix}_${randomBytes(32).toString('base64url')}`;
	const [created] = await db
		.insert(apiKey)
		.values({
			name: input.name,
			prefix,
			keyHash: hashKey(key),
			scopes: [...new Set(input.scopes)].sort(),
			expiresAt: input.expiresAt
		})
		.returning(viewColumns);
	return { key, view: created };
}

export async function listApiKeys(): Promise<ApiKeyView[]> {
	return getDb().select(viewColumns).from(apiKey).orderBy(desc(apiKey.createdAt));
}

export async function revokeApiKey(
	id: string,
	now = new Date(),
	db: Database | Transaction = getDb()
): Promise<ApiKeyView> {
	const [revoked] = await db
		.update(apiKey)
		.set({ revokedAt: now, updatedAt: now })
		.where(eq(apiKey.id, id))
		.returning(viewColumns);
	if (revoked === undefined) {
		throw new NotFoundError('API key');
	}
	return revoked;
}

/** Deletes a key for good, revoked or not; from then on it fails like any unknown key. */
export async function deleteApiKey(
	id: string,
	db: Database | Transaction = getDb()
): Promise<ApiKeyView> {
	const [deleted] = await db.delete(apiKey).where(eq(apiKey.id, id)).returning(viewColumns);
	if (deleted === undefined) {
		throw new NotFoundError('API key');
	}
	return deleted;
}

/**
 * Finds the key behind a presented one. A malformed, unknown, revoked or expired key answers
 * null, all alike. A valid one has its last use recorded.
 */
export async function authenticateApiKey(
	presented: string,
	origin: { ip: string | null },
	now = new Date()
): Promise<ApiKeyIdentity | null> {
	const match = KEY_PATTERN.exec(presented);
	if (match === null) {
		return null;
	}
	const [row] = await getDb().select().from(apiKey).where(eq(apiKey.prefix, match[1])).limit(1);
	if (row === undefined) {
		return null;
	}
	const expected = Buffer.from(row.keyHash, 'hex');
	const actual = Buffer.from(hashKey(presented), 'hex');
	if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
		return null;
	}
	if (row.revokedAt !== null || (row.expiresAt !== null && row.expiresAt <= now)) {
		return null;
	}

	await getDb()
		.update(apiKey)
		.set({ lastUsedAt: now, lastUsedIp: origin.ip })
		.where(and(eq(apiKey.id, row.id)));
	return { id: row.id, name: row.name, scopes: row.scopes, expiresAt: row.expiresAt };
}
