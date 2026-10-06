import { and, desc, eq } from 'drizzle-orm';
import { getDb, type Database, type Transaction } from './db';
import { apiKey } from './db/schema';
import { NotFoundError } from './errors';
import { issueToken, tokenMatches, tokenPrefix } from './secret-tokens';
import type { ApiKeyView } from '$lib/types/api-keys';

// API keys: `mfd_` tokens (secret-tokens.ts) with scopes, stored as a hash. The key itself is
// shown once, when it is created.

/** The one note a note token reaches, and whether it may change it. */
export interface NoteGrant {
	id: string;
	access: 'read' | 'edit';
}

/** What a request authenticated by an API key, or by a note token, knows about it. */
export interface ApiKeyIdentity {
	id: string;
	name: string;
	scopes: string[];
	expiresAt: Date | null;
	/** Set for a note token: the routes and tools marked for note tokens, on its own note only. */
	note?: NoteGrant;
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
	const { token: key, prefix, hash } = issueToken('mfd');
	const [created] = await db
		.insert(apiKey)
		.values({
			name: input.name,
			prefix,
			keyHash: hash,
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
	const prefix = tokenPrefix(presented, 'mfd');
	if (prefix === null) {
		return null;
	}
	const [row] = await getDb().select().from(apiKey).where(eq(apiKey.prefix, prefix)).limit(1);
	if (row === undefined || !tokenMatches(presented, row.keyHash)) {
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
