import type { ApiKeyIdentity } from '$lib/server/api-keys';
import type { CredentialProvider } from '$lib/server/api/credentials';
import { getDb } from '$lib/server/db';
import { NotFoundError } from '$lib/server/errors';
import { issueToken, tokenMatches, tokenPrefix } from '$lib/server/secret-tokens';
import { isUuid } from '$lib/utils/uuid';
import { and, desc, eq, isNull, type SQL } from 'drizzle-orm';
import { note, noteFile, noteToken } from './schema.server';
import type { NoteTokenAccess, NoteTokenView } from './types';

// Note tokens: `mfn_` tokens (secret-tokens.ts) that reach one note, to read it or to change it,
// until a fixed day. They open the note on /shared and work as Bearer keys on the routes and
// tools marked for them. Only a hash is stored; the token is shown once.

export const NOTE_TOKEN_PREFIX = 'mfn_';

/** Holds the token of the shared note a browser opened, so the token never sits in an address. */
export const NOTE_TOKEN_COOKIE = 'manifold-note-token';

/** What a request authenticated by a note token knows about it. */
export interface NoteTokenGrant {
	id: string;
	name: string;
	noteId: string;
	access: NoteTokenAccess;
	expiresAt: Date;
}

const viewColumns = {
	id: noteToken.id,
	noteId: noteToken.noteId,
	noteTitle: note.title,
	name: noteToken.name,
	access: noteToken.access,
	prefix: noteToken.prefix,
	expiresAt: noteToken.expiresAt,
	lastUsedAt: noteToken.lastUsedAt,
	lastUsedIp: noteToken.lastUsedIp,
	revokedAt: noteToken.revokedAt,
	createdAt: noteToken.createdAt
};

async function findView(id: string): Promise<NoteTokenView> {
	if (!isUuid(id)) {
		throw new NotFoundError('Note token');
	}
	const [row] = await getDb()
		.select(viewColumns)
		.from(noteToken)
		.innerJoin(note, eq(note.id, noteToken.noteId))
		.where(eq(noteToken.id, id))
		.limit(1);
	if (row === undefined) {
		throw new NotFoundError('Note token');
	}
	return row;
}

/**
 * Creates a token for a note outside the trash and answers it in full; this is the only time the
 * full token exists.
 */
export async function createNoteToken(input: {
	noteId: string;
	name: string;
	access: NoteTokenAccess;
	expiresAt: Date;
}): Promise<{ token: string; view: NoteTokenView }> {
	if (!isUuid(input.noteId)) {
		throw new NotFoundError('Note');
	}
	const [target] = await getDb()
		.select({ id: note.id })
		.from(note)
		.where(and(eq(note.id, input.noteId), isNull(note.deletedAt)))
		.limit(1);
	if (target === undefined) {
		throw new NotFoundError('Note');
	}

	const { token, prefix, hash } = issueToken('mfn');
	const [created] = await getDb()
		.insert(noteToken)
		.values({
			noteId: target.id,
			name: input.name,
			access: input.access,
			prefix,
			tokenHash: hash,
			expiresAt: input.expiresAt
		})
		.returning({ id: noteToken.id });
	return { token, view: await findView(created.id) };
}

/** Every token, or those of one note, newest first. */
export async function listNoteTokens(noteId?: string): Promise<NoteTokenView[]> {
	let where: SQL | undefined;
	if (noteId !== undefined) {
		if (!isUuid(noteId)) {
			return [];
		}
		where = eq(noteToken.noteId, noteId);
	}
	return getDb()
		.select(viewColumns)
		.from(noteToken)
		.innerJoin(note, eq(note.id, noteToken.noteId))
		.where(where)
		.orderBy(desc(noteToken.createdAt), desc(noteToken.id));
}

export async function revokeNoteToken(id: string, now = new Date()): Promise<NoteTokenView> {
	const current = await findView(id);
	await getDb()
		.update(noteToken)
		.set({ revokedAt: now, updatedAt: now })
		.where(eq(noteToken.id, current.id));
	return { ...current, revokedAt: now };
}

/** Deletes a token for good, revoked or not; from then on it fails like any unknown token. */
export async function deleteNoteToken(id: string): Promise<NoteTokenView> {
	const current = await findView(id);
	await getDb().delete(noteToken).where(eq(noteToken.id, current.id));
	return current;
}

/**
 * Finds the token behind a presented one. A malformed, unknown, revoked or expired token, or one
 * whose note is in the trash, answers null, all alike. A valid one has its last use recorded.
 */
export async function authenticateNoteToken(
	presented: string,
	origin: { ip: string | null },
	now = new Date()
): Promise<NoteTokenGrant | null> {
	const prefix = tokenPrefix(presented, 'mfn');
	if (prefix === null) {
		return null;
	}
	const [row] = await getDb()
		.select({ token: noteToken, trashedAt: note.deletedAt })
		.from(noteToken)
		.innerJoin(note, eq(note.id, noteToken.noteId))
		.where(eq(noteToken.prefix, prefix))
		.limit(1);
	if (row === undefined || !tokenMatches(presented, row.token.tokenHash)) {
		return null;
	}
	const { token } = row;
	if (token.revokedAt !== null || token.expiresAt <= now || row.trashedAt !== null) {
		return null;
	}

	await getDb()
		.update(noteToken)
		.set({ lastUsedAt: now, lastUsedIp: origin.ip })
		.where(eq(noteToken.id, token.id));
	return {
		id: token.id,
		name: token.name,
		noteId: token.noteId,
		access: token.access,
		expiresAt: token.expiresAt
	};
}

/** Whether a note shows an uploaded file, so the note's token may load it. */
export async function noteShowsFile(noteId: string, fileId: string): Promise<boolean> {
	if (!isUuid(fileId)) {
		return false;
	}
	const [row] = await getDb()
		.select({ fileId: noteFile.fileId })
		.from(noteFile)
		.where(and(eq(noteFile.noteId, noteId), eq(noteFile.fileId, fileId)))
		.limit(1);
	return row !== undefined;
}

/** A note token as the API and MCP see it: the notes scopes its access needs, on its note only. */
export function noteTokenIdentity(grant: NoteTokenGrant): ApiKeyIdentity {
	const scopes = ['notes:read'];
	if (grant.access === 'edit') {
		scopes.push('notes:write');
	}
	return {
		id: grant.id,
		name: grant.name,
		scopes,
		expiresAt: grant.expiresAt,
		note: { id: grant.noteId, access: grant.access }
	};
}

export const noteTokenCredentials: CredentialProvider = {
	prefix: NOTE_TOKEN_PREFIX,
	authenticate: async (presented, origin) => {
		const grant = await authenticateNoteToken(presented, origin);
		if (grant === null) {
			return null;
		}
		return noteTokenIdentity(grant);
	}
};
