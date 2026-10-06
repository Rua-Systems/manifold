import { ownerActor } from '$lib/server/actor';
import { createApiKey } from '$lib/server/api-keys';
import { handleApiRequest } from '$lib/server/api/router';
import { getDb } from '$lib/server/db';
import { auditEvent, file } from '$lib/server/db/schema';
import { NotFoundError } from '$lib/server/errors';
import { storeUpload } from '$lib/server/files/files';
import { desc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createNote, deleteNotePermanently, trashNote, updateNote } from './notes.server';
import { note, noteRevision, noteToken } from './schema.server';
import {
	authenticateNoteToken,
	createNoteToken,
	deleteNoteToken,
	listNoteTokens,
	noteShowsFile,
	revokeNoteToken
} from './tokens.server';
import type { NoteTokenAccess } from './types';

const OWNER = ownerActor('owner-1');
const DAY = 24 * 60 * 60 * 1000;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const ORIGIN = { ip: '10.4.4.4' };

function doc(text: string) {
	return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

async function tokenFor(
	noteId: string,
	access: NoteTokenAccess,
	expiresAt = new Date(Date.now() + DAY)
) {
	return createNoteToken({ noteId, name: `${access} token`, access, expiresAt });
}

async function call(method: string, path: string, token: string, body?: unknown) {
	const headers: Record<string, string> = { authorization: `Bearer ${token}` };
	let payload: string | undefined;
	if (body !== undefined) {
		headers['content-type'] = 'application/json';
		payload = JSON.stringify(body);
	}
	return handleApiRequest(
		new Request(`http://localhost/api/v1${path}`, { method, headers, body: payload }),
		{ origin: { ip: '10.4.4.4', userAgent: 'vitest' } }
	);
}

beforeEach(async () => {
	await getDb().delete(note);
	await getDb().delete(file);
});

describe('note tokens', () => {
	it('shows the token once, stores its hash and authenticates it for its note', async () => {
		const target = await createNote({ title: 'Shared', content: doc('Hello') }, OWNER);
		const { token, view } = await tokenFor(target.id, 'read');
		expect(token).toMatch(/^mfn_[a-z0-9]{8}_[A-Za-z0-9_-]{43}$/);
		expect(view).toMatchObject({
			noteId: target.id,
			noteTitle: 'Shared',
			name: 'read token',
			access: 'read',
			revokedAt: null,
			lastUsedAt: null
		});

		const [row] = await getDb().select().from(noteToken).where(eq(noteToken.id, view.id));
		expect(JSON.stringify(row)).not.toContain(token.slice(13));

		const grant = await authenticateNoteToken(token, ORIGIN);
		expect(grant).toMatchObject({ id: view.id, noteId: target.id, access: 'read' });
		const [listed] = await listNoteTokens(target.id);
		expect(listed.lastUsedIp).toBe('10.4.4.4');
	});

	it('refuses malformed, unknown, revoked and expired tokens, and those of trashed notes', async () => {
		const target = await createNote({ title: 'Shared' }, OWNER);
		const revoked = await tokenFor(target.id, 'read');
		await revokeNoteToken(revoked.view.id);
		const expired = await tokenFor(target.id, 'read', new Date(Date.now() - 1000));
		const valid = await tokenFor(target.id, 'edit');
		const { key: apiKey } = await createApiKey({
			name: 'Key',
			scopes: ['notes:read'],
			expiresAt: null
		});

		for (const presented of [
			'not-a-token',
			`mfn_abcdefgh_${'A'.repeat(43)}`,
			apiKey,
			revoked.token,
			expired.token
		]) {
			expect(await authenticateNoteToken(presented, ORIGIN)).toBeNull();
		}
		expect(await authenticateNoteToken(valid.token, ORIGIN)).not.toBeNull();

		await trashNote(target.id);
		expect(await authenticateNoteToken(valid.token, ORIGIN)).toBeNull();
	});

	it('is created only for a note outside the trash', async () => {
		const target = await createNote({ title: 'Gone' }, OWNER);
		await trashNote(target.id);
		await expect(tokenFor(target.id, 'read')).rejects.toBeInstanceOf(NotFoundError);
		await expect(tokenFor('not-a-uuid', 'read')).rejects.toBeInstanceOf(NotFoundError);
	});

	it('lists tokens newest first, deletes them and goes with its note', async () => {
		const first = await createNote({ title: 'First' }, OWNER);
		const second = await createNote({ title: 'Second' }, OWNER);
		const older = await tokenFor(first.id, 'read');
		const newer = await tokenFor(second.id, 'edit');

		expect((await listNoteTokens()).map((token) => token.id)).toEqual([
			newer.view.id,
			older.view.id
		]);
		expect((await listNoteTokens(first.id)).map((token) => token.id)).toEqual([older.view.id]);

		await deleteNoteToken(older.view.id);
		expect(await authenticateNoteToken(older.token, ORIGIN)).toBeNull();
		await expect(deleteNoteToken(older.view.id)).rejects.toBeInstanceOf(NotFoundError);

		await trashNote(second.id);
		await deleteNotePermanently(second.id);
		expect(await listNoteTokens()).toEqual([]);
	});

	it('lets a token load only the files its note shows', async () => {
		const image = await storeUpload(new File([PNG], 'dot.png'), { ownerModule: 'notes' });
		const other = await storeUpload(new File([PNG], 'dot.png'), { ownerModule: 'notes' });
		const target = await createNote(
			{
				title: 'With image',
				content: {
					type: 'doc',
					content: [{ type: 'image', attrs: { src: `/files/${image.id}` } }]
				}
			},
			OWNER
		);
		expect(await noteShowsFile(target.id, image.id)).toBe(true);
		expect(await noteShowsFile(target.id, other.id)).toBe(false);
		expect(await noteShowsFile(target.id, 'not-a-uuid')).toBe(false);
	});
});

describe('note tokens on the API', () => {
	it('reads its own note only, and nothing else', async () => {
		const target = await createNote({ title: 'Mine', content: doc('Read me') }, OWNER);
		const other = await createNote({ title: 'Other' }, OWNER);
		const { token } = await tokenFor(target.id, 'read');

		const read = await call('GET', `/notes/${target.id}`, token);
		expect(read.status).toBe(200);
		expect(await read.json()).toMatchObject({ title: 'Mine' });

		const me = await call('GET', '/me', token);
		expect(await me.json()).toMatchObject({
			name: 'read token',
			note: { id: target.id, access: 'read' }
		});

		expect((await call('GET', `/notes/${other.id}`, token)).status).toBe(404);
		for (const [method, path] of [
			['GET', '/notes'],
			['GET', '/search?q=mine'],
			['GET', '/openapi.json'],
			['GET', `/notes/${target.id}/revisions`],
			['PATCH', `/notes/${target.id}`]
		]) {
			const response = await call(
				method,
				path,
				token,
				method === 'PATCH' ? { version: 1 } : undefined
			);
			expect(response.status, `${method} ${path}`).toBe(403);
		}
	});

	it('changes its own note with edit access, as a note token', async () => {
		const target = await createNote({ title: 'Draft', content: doc('One') }, OWNER);
		const other = await createNote({ title: 'Other' }, OWNER);
		const { token, view } = await tokenFor(target.id, 'edit');

		const changed = await call('PATCH', `/notes/${target.id}`, token, {
			version: 1,
			title: 'Edited'
		});
		expect(changed.status).toBe(200);
		expect(await changed.json()).toMatchObject({ title: 'Edited', version: 2 });

		const [revision] = await getDb()
			.select()
			.from(noteRevision)
			.where(eq(noteRevision.noteId, target.id))
			.orderBy(desc(noteRevision.version))
			.limit(1);
		expect(revision).toMatchObject({ actorType: 'note_token', actorId: view.id });
		const [event] = await getDb()
			.select()
			.from(auditEvent)
			.where(eq(auditEvent.action, 'note.update'))
			.orderBy(desc(auditEvent.occurredAt))
			.limit(1);
		expect(event).toMatchObject({
			actorType: 'note_token',
			actorId: view.id,
			targetId: target.id
		});

		expect(
			(await call('PATCH', `/notes/${other.id}`, token, { version: 1, title: 'No' })).status
		).toBe(404);
		expect((await call('DELETE', `/notes/${target.id}`, token)).status).toBe(403);
	});

	it('stops working while its note is in the trash', async () => {
		const target = await createNote({ title: 'Soon gone' }, OWNER);
		const { token } = await tokenFor(target.id, 'edit');
		await updateNote(target.id, { title: 'Still here', baseVersion: 1 }, OWNER);
		expect((await call('GET', `/notes/${target.id}`, token)).status).toBe(200);
		await trashNote(target.id);
		expect((await call('GET', `/notes/${target.id}`, token)).status).toBe(401);
	});
});
