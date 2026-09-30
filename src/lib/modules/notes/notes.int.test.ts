import { ownerActor, SYSTEM_ACTOR, type Actor } from '$lib/server/actor';
import { getDb } from '$lib/server/db';
import { file } from '$lib/server/db/schema';
import { ConflictError, NotFoundError, ValidationError } from '$lib/server/errors';
import { storeUpload } from '$lib/server/files/files';
import { housekeepingTasks } from '$lib/server/tasks';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { NoteContent } from './content';
import { notesServerManifest } from './manifest.server';
import {
	createNote,
	deleteNotePermanently,
	getNote,
	getRevision,
	listNotes,
	listRevisions,
	purgeTrashedNotes,
	restoreNote,
	restoreRevision,
	trashNote,
	updateNote
} from './notes.server';
import { note, noteFile, noteRevision } from './schema.server';

const OWNER = ownerActor('owner-1');
const API_KEY: Actor = { type: 'api_key', id: 'key-1' };
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

function doc(...paragraphs: string[]): NoteContent {
	return {
		type: 'doc',
		content: paragraphs.map((text) => ({
			type: 'paragraph',
			content: [{ type: 'text', text }]
		}))
	};
}

function withImages(...fileIds: string[]): NoteContent {
	return {
		type: 'doc',
		content: fileIds.map((id) => ({ type: 'image', attrs: { src: `/files/${id}` } }))
	};
}

async function storeImage(): Promise<string> {
	const stored = await storeUpload(new File([new Uint8Array(PNG)], 'photo.png'), {
		ownerModule: 'notes'
	});
	return stored.id;
}

async function linkedFiles(noteId: string): Promise<string[]> {
	const rows = await getDb()
		.select({ fileId: noteFile.fileId })
		.from(noteFile)
		.where(eq(noteFile.noteId, noteId));
	return rows.map((row) => row.fileId).sort();
}

async function fileExists(id: string): Promise<boolean> {
	const [row] = await getDb().select({ id: file.id }).from(file).where(eq(file.id, id));
	return row !== undefined;
}

beforeEach(async () => {
	await getDb().delete(note);
	await getDb().delete(file);
});

describe('notes', () => {
	it('creates and edits a note, deriving its plain text and counting versions', async () => {
		const created = await createNote(
			{ title: 'Groceries', content: doc('Milk', 'Eggs') },
			OWNER
		);
		expect(created).toMatchObject({ title: 'Groceries', version: 1, deletedAt: null });

		const updated = await updateNote(
			created.id,
			{ title: 'Groceries', content: doc('Milk', 'Eggs', 'Bread'), baseVersion: 1 },
			OWNER
		);
		expect(updated.version).toBe(2);

		const [row] = await getDb().select().from(note).where(eq(note.id, created.id));
		expect(row.contentText).toBe('Milk\nEggs\nBread');
		expect((await listNotes())[0].excerpt).toBe('Milk Eggs Bread');
	});

	it('starts an empty untitled note when nothing is given', async () => {
		const created = await createNote({}, OWNER);
		expect(created.title).toBe('');
		expect(created.content).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
	});

	it('refuses a write based on an older version and reports the current one', async () => {
		const created = await createNote({ content: doc('One') }, OWNER);
		await updateNote(created.id, { content: doc('Two'), baseVersion: 1 }, OWNER);

		await expect(
			updateNote(created.id, { content: doc('Stale'), baseVersion: 1 }, OWNER)
		).rejects.toSatisfy(
			(error) => error instanceof ConflictError && error.currentVersion === 2
		);
		expect((await getNote(created.id)).content).toEqual(doc('Two'));
	});

	it('rejects unknown node and mark types, unsafe links, outside images and oversized content', async () => {
		const invalid: unknown[] = [
			{ type: 'doc', content: [{ type: 'iframe', attrs: { src: 'https://example.com' } }] },
			{
				type: 'doc',
				content: [
					{
						type: 'paragraph',
						content: [{ type: 'text', text: 'x', marks: [{ type: 'highlight' }] }]
					}
				]
			},
			{
				type: 'doc',
				content: [
					{
						type: 'paragraph',
						content: [
							{
								type: 'text',
								text: 'click',
								marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]
							}
						]
					}
				]
			},
			{
				type: 'doc',
				content: [{ type: 'image', attrs: { src: 'https://example.com/a.png' } }]
			},
			doc('x'.repeat(2 * 1024 * 1024))
		];

		for (const content of invalid) {
			await expect(createNote({ content }, OWNER)).rejects.toBeInstanceOf(ValidationError);
		}
		expect(await listNotes()).toHaveLength(0);
	});

	it('filters by title and text, treating % and _ literally', async () => {
		await createNote({ title: 'Trip plan', content: doc('Book the ferry') }, OWNER);
		await createNote({ title: 'Budget', content: doc('Save 100% of the bonus') }, OWNER);
		await createNote({ title: 'snake_case', content: doc('Naming') }, OWNER);

		expect((await listNotes({ query: 'ferry' })).map((item) => item.title)).toEqual([
			'Trip plan'
		]);
		expect((await listNotes({ query: 'TRIP' })).map((item) => item.title)).toEqual([
			'Trip plan'
		]);
		expect((await listNotes({ query: '100%' })).map((item) => item.title)).toEqual(['Budget']);
		expect((await listNotes({ query: 'e_c' })).map((item) => item.title)).toEqual([
			'snake_case'
		]);
	});
});

describe('revisions', () => {
	it("folds the owner's edits within five minutes into one revision", async () => {
		const start = new Date('2026-03-01T10:00:00Z');
		const created = await createNote({ content: doc('a') }, OWNER, { now: start });
		await updateNote(created.id, { content: doc('ab'), baseVersion: 1 }, OWNER, {
			now: new Date(start.getTime() + 2 * MINUTE)
		});
		await updateNote(created.id, { content: doc('abc'), baseVersion: 2 }, OWNER, {
			now: new Date(start.getTime() + 4 * MINUTE)
		});

		const revisions = await listRevisions(created.id);
		expect(revisions).toHaveLength(1);
		expect(revisions[0]).toMatchObject({ version: 3, actorType: 'owner', actorId: 'owner-1' });
		expect((await getRevision(created.id, 3)).content).toEqual(doc('abc'));
	});

	it('starts a new revision after five minutes', async () => {
		const start = new Date('2026-03-01T10:00:00Z');
		const created = await createNote({ content: doc('a') }, OWNER, { now: start });
		await updateNote(created.id, { content: doc('ab'), baseVersion: 1 }, OWNER, {
			now: new Date(start.getTime() + 6 * MINUTE)
		});

		expect((await listRevisions(created.id)).map((item) => item.version)).toEqual([2, 1]);
	});

	it('starts a new revision when the actor changes, and for every API write', async () => {
		const start = new Date('2026-03-01T10:00:00Z');
		const at = (minutes: number) => ({ now: new Date(start.getTime() + minutes * MINUTE) });
		const created = await createNote({ content: doc('a') }, OWNER, at(0));
		await updateNote(created.id, { content: doc('b'), baseVersion: 1 }, API_KEY, at(1));
		await updateNote(created.id, { content: doc('c'), baseVersion: 2 }, API_KEY, at(2));
		await updateNote(created.id, { content: doc('d'), baseVersion: 3 }, OWNER, at(3));
		await updateNote(created.id, { content: doc('e'), baseVersion: 4 }, SYSTEM_ACTOR, at(4));

		const revisions = await listRevisions(created.id);
		expect(revisions.map((item) => [item.version, item.actorType])).toEqual([
			[5, 'system'],
			[4, 'owner'],
			[3, 'api_key'],
			[2, 'api_key'],
			[1, 'owner']
		]);
	});

	it('restores a revision as a new version on top', async () => {
		const start = new Date('2026-03-01T10:00:00Z');
		const created = await createNote({ title: 'First', content: doc('old') }, OWNER, {
			now: start
		});
		await updateNote(
			created.id,
			{ title: 'Second', content: doc('new'), baseVersion: 1 },
			OWNER,
			{ now: new Date(start.getTime() + 10 * MINUTE) }
		);

		const restored = await restoreRevision(created.id, 1, OWNER, {
			now: new Date(start.getTime() + 11 * MINUTE)
		});
		expect(restored).toMatchObject({ title: 'First', content: doc('old'), version: 3 });
		expect((await listRevisions(created.id)).map((item) => item.version)).toEqual([3, 2, 1]);
	});

	it('answers not found for an unknown revision', async () => {
		const created = await createNote({ content: doc('a') }, OWNER);
		await expect(getRevision(created.id, 9)).rejects.toBeInstanceOf(NotFoundError);
	});
});

describe('trash', () => {
	it('hides trashed notes, restores them and deletes them only from the trash', async () => {
		const kept = await createNote({ title: 'Kept' }, OWNER);
		const trashed = await createNote({ title: 'Trashed' }, OWNER);

		await expect(deleteNotePermanently(trashed.id)).rejects.toBeInstanceOf(ValidationError);
		await trashNote(trashed.id);

		expect((await listNotes()).map((item) => item.title)).toEqual(['Kept']);
		expect((await listNotes({ trashed: true })).map((item) => item.title)).toEqual(['Trashed']);
		await expect(getNote(trashed.id)).rejects.toBeInstanceOf(NotFoundError);
		await expect(
			updateNote(trashed.id, { content: doc('x'), baseVersion: 1 }, OWNER)
		).rejects.toBeInstanceOf(NotFoundError);

		await restoreNote(trashed.id);
		expect((await listNotes()).map((item) => item.title).sort()).toEqual(['Kept', 'Trashed']);

		await trashNote(trashed.id);
		await deleteNotePermanently(trashed.id);
		await expect(getNote(trashed.id, { includeTrashed: true })).rejects.toBeInstanceOf(
			NotFoundError
		);
		expect((await getNote(kept.id)).title).toBe('Kept');
	});

	it('purges notes and their revisions once the retention period has passed', async () => {
		const now = new Date('2026-03-31T00:00:00Z');
		const old = await createNote({ title: 'Old' }, OWNER);
		const recent = await createNote({ title: 'Recent' }, OWNER);
		await trashNote(old.id, new Date(now.getTime() - 31 * DAY));
		await trashNote(recent.id, new Date(now.getTime() - 29 * DAY));

		expect(await purgeTrashedNotes(now, 30)).toBe(1);

		await expect(getNote(old.id, { includeTrashed: true })).rejects.toBeInstanceOf(
			NotFoundError
		);
		const revisions = await getDb()
			.select()
			.from(noteRevision)
			.where(eq(noteRevision.noteId, old.id));
		expect(revisions).toHaveLength(0);
		expect((await getNote(recent.id, { includeTrashed: true })).title).toBe('Recent');
	});
});

describe('images', () => {
	it('links the files the content shows and drops them when no version shows them', async () => {
		const start = new Date('2026-03-01T10:00:00Z');
		const first = await storeImage();
		const second = await storeImage();
		const created = await createNote({ content: withImages(first, second) }, OWNER, {
			now: start
		});
		expect(await linkedFiles(created.id)).toEqual([first, second].sort());

		// Within the same revision: the first image is gone from every version.
		await updateNote(created.id, { content: withImages(second), baseVersion: 1 }, OWNER, {
			now: new Date(start.getTime() + MINUTE)
		});
		expect(await linkedFiles(created.id)).toEqual([second]);

		// In a new revision: version 2 still shows the second image, so it stays linked.
		await updateNote(created.id, { content: doc('text only'), baseVersion: 2 }, OWNER, {
			now: new Date(start.getTime() + 10 * MINUTE)
		});
		expect(await linkedFiles(created.id)).toEqual([second]);

		const restored = await restoreRevision(created.id, 2, OWNER);
		expect(restored.content.content?.[0].attrs?.src).toBe(`/files/${second}`);
	});

	it('ignores image ids that have no stored file', async () => {
		const created = await createNote(
			{ content: withImages('00000000-0000-4000-8000-000000000000') },
			OWNER
		);
		expect(await linkedFiles(created.id)).toEqual([]);
	});

	it('removes the files of a purged note in the same housekeeping run', async () => {
		const shared = await storeImage();
		const own = await storeImage();
		const purged = await createNote({ content: withImages(shared, own) }, OWNER);
		await createNote({ content: withImages(shared) }, OWNER);

		const now = new Date(Date.now() + 40 * DAY);
		await trashNote(purged.id, new Date(now.getTime() - 31 * DAY));
		for (const task of housekeepingTasks()) {
			await task.run(now);
		}

		expect(await fileExists(own)).toBe(false);
		expect(await fileExists(shared)).toBe(true);
	});
});

describe('sidebar', () => {
	it('lists Map Notes, New note, the notes by last update, then Show all', async () => {
		const start = new Date('2026-03-01T10:00:00Z');
		await createNote({ title: 'Older' }, OWNER, { now: start });
		await createNote({ title: '' }, OWNER, { now: new Date(start.getTime() + MINUTE) });
		const trashed = await createNote({ title: 'Trashed' }, OWNER);
		await trashNote(trashed.id);

		const group = await notesServerManifest.sidebarGroup?.();
		expect(group?.items.map((item) => item.label)).toEqual([
			'Map Notes',
			'New Note',
			'Untitled',
			'Older',
			'Show all'
		]);
		expect(group?.items.map((item) => item.filterable ?? false)).toEqual([
			false,
			false,
			true,
			true,
			false
		]);
		expect(group?.items[0].link).toEqual({ kind: 'internal', path: '/notes/map' });
		expect(group?.items[1].link).toEqual({ kind: 'internal', path: '/notes/new' });
		expect(group?.items[4].link).toEqual({ kind: 'internal', path: '/notes' });
		expect(group?.filterLabel).toBe('Filter notes');
	});
});
