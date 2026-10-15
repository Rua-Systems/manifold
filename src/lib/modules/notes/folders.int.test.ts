import { ownerActor } from '$lib/server/actor';
import { getDb } from '$lib/server/db';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import type { FieldErrors } from '$lib/types/validation';
import { eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	allNoteFolders,
	countNoteFolders,
	createNoteFolder,
	deleteNoteFolder,
	getNoteFolder,
	listNoteFolders,
	moveNoteFolder,
	moveNoteToFolder,
	noteCountsByFolder,
	noteFolderPath,
	renameNoteFolder
} from './folders.server';
import { notesServerManifest } from './manifest.server';
import {
	createNote,
	getNote,
	listNotePage,
	listNotes,
	restoreNote,
	trashNote,
	updateNote
} from './notes.server';
import { note } from './schema.server';
import { notesUsage } from './usage.server';

const OWNER = ownerActor('owner-1');

/** The field errors a call was refused with. */
async function refusal(work: Promise<unknown>): Promise<FieldErrors> {
	try {
		await work;
	} catch (error) {
		if (error instanceof ValidationError) {
			return error.fields;
		}
		throw error;
	}
	throw new Error('Expected a refusal.');
}

beforeEach(async () => {
	// Truncating the folders takes the notes in them along, and every row that hangs on a note.
	await getDb().execute(sql`truncate note_folder, note cascade`);
});

describe('note folders', () => {
	it('nests folders and lists them by name with what they hold', async () => {
		const work = await createNoteFolder({ name: 'Work', parentId: null });
		const atlas = await createNoteFolder({ name: 'atlas', parentId: work.id });
		await createNoteFolder({ name: 'Budget', parentId: work.id });
		await createNoteFolder({ name: 'Home', parentId: null });
		await createNote({ title: 'Plan', folderId: work.id }, OWNER);
		const trashed = await createNote({ title: 'Old', folderId: work.id }, OWNER);
		await trashNote(trashed.id);

		const top = await listNoteFolders(null);
		expect(top.map((folder) => folder.name)).toEqual(['Home', 'Work']);
		expect(top[1]).toMatchObject({ noteCount: 1, folderCount: 2, parentId: null });

		const inside = await listNoteFolders(work.id);
		expect(inside.map((folder) => folder.name)).toEqual(['atlas', 'Budget']);
		expect(await noteFolderPath(atlas.id)).toEqual([
			{ id: work.id, name: 'Work' },
			{ id: atlas.id, name: 'atlas' }
		]);
		expect(await noteFolderPath('not-a-uuid')).toEqual([]);
		expect((await allNoteFolders()).map((folder) => folder.name)).toEqual([
			'atlas',
			'Budget',
			'Home',
			'Work'
		]);
		expect(await countNoteFolders()).toBe(4);
		expect(await noteCountsByFolder()).toEqual({ [work.id]: 1 });
	});

	it('keeps names unique per place whatever their case, and plain', async () => {
		const work = await createNoteFolder({ name: 'Work', parentId: null });
		expect(await refusal(createNoteFolder({ name: 'work', parentId: null }))).toEqual({
			name: 'A folder here already has this name.'
		});
		// The same name is fine in another place.
		await createNoteFolder({ name: 'Work', parentId: work.id });
		expect(await refusal(createNoteFolder({ name: 'a/b', parentId: null }))).toEqual({
			name: 'Use a name without slashes or control characters.'
		});
		expect(await refusal(createNoteFolder({ name: '   ', parentId: null }))).toHaveProperty(
			'name'
		);
		expect(
			await refusal(createNoteFolder({ name: 'x'.repeat(101), parentId: null }))
		).toHaveProperty('name');

		const home = await createNoteFolder({ name: '  Home  ', parentId: null });
		expect(home.name).toBe('Home');
		expect(await refusal(renameNoteFolder(home.id, 'WORK'))).toEqual({
			name: 'A folder here already has this name.'
		});
		await renameNoteFolder(home.id, 'House');
		expect((await getNoteFolder(home.id))?.name).toBe('House');
	});

	it('refuses a parent that does not exist', async () => {
		await expect(
			createNoteFolder({ name: 'Lost', parentId: crypto.randomUUID() })
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it('moves folders, never into themselves or below them', async () => {
		const work = await createNoteFolder({ name: 'Work', parentId: null });
		const atlas = await createNoteFolder({ name: 'Atlas', parentId: work.id });
		const maps = await createNoteFolder({ name: 'Maps', parentId: atlas.id });
		const home = await createNoteFolder({ name: 'Home', parentId: null });

		expect(await refusal(moveNoteFolder(work.id, maps.id))).toEqual({
			target: 'A folder cannot move into itself or a folder inside it.'
		});
		expect(await refusal(moveNoteFolder(work.id, work.id))).toHaveProperty('target');

		await moveNoteFolder(atlas.id, home.id);
		expect(await noteFolderPath(maps.id)).toEqual([
			{ id: home.id, name: 'Home' },
			{ id: atlas.id, name: 'Atlas' },
			{ id: maps.id, name: 'Maps' }
		]);
		await moveNoteFolder(atlas.id, null);
		expect((await getNoteFolder(atlas.id))?.parentId).toBeNull();

		// A folder of the same name already at the target.
		await createNoteFolder({ name: 'Atlas', parentId: home.id });
		expect(await refusal(moveNoteFolder(atlas.id, home.id))).toEqual({
			name: 'A folder here already has this name.'
		});
	});

	it('deletes only empty folders, and moves notes in the trash to the top', async () => {
		const work = await createNoteFolder({ name: 'Work', parentId: null });
		const atlas = await createNoteFolder({ name: 'Atlas', parentId: work.id });
		expect(await refusal(deleteNoteFolder(work.id))).toEqual({
			folder: 'Move or delete what is inside the folder first.'
		});

		const kept = await createNote({ title: 'Kept', folderId: atlas.id }, OWNER);
		expect(await refusal(deleteNoteFolder(atlas.id))).toHaveProperty('folder');

		await trashNote(kept.id);
		await deleteNoteFolder(atlas.id);
		expect(await getNoteFolder(atlas.id)).toBeNull();
		const restored = await restoreNote(kept.id);
		expect(restored.folderId).toBeNull();

		await deleteNoteFolder(work.id);
		expect(await countNoteFolders()).toBe(0);
		await expect(deleteNoteFolder(work.id)).rejects.toBeInstanceOf(NotFoundError);
	});

	it('creates notes in folders and moves them without a new version', async () => {
		const work = await createNoteFolder({ name: 'Work', parentId: null });
		const created = await createNote({ title: 'Plan', folderId: work.id }, OWNER);
		expect(created.folderId).toBe(work.id);

		expect(
			await refusal(createNote({ title: 'Lost', folderId: crypto.randomUUID() }, OWNER))
		).toEqual({ folder: 'The folder was not found.' });
		expect(await refusal(createNote({ title: 'Lost', folderId: 'nope' }, OWNER))).toEqual({
			folder: 'The folder was not found.'
		});

		const home = await createNoteFolder({ name: 'Home', parentId: null });
		const before = await getNote(created.id);
		await moveNoteToFolder(created.id, home.id);
		const moved = await getNote(created.id);
		expect(moved.folderId).toBe(home.id);
		expect(moved.version).toBe(before.version);
		expect(moved.updatedAt).toEqual(before.updatedAt);

		// An open editor keeps saving on top of the version it knows.
		const edited = await updateNote(
			created.id,
			{ title: 'Plan B', baseVersion: before.version },
			OWNER
		);
		expect(edited.folderId).toBe(home.id);

		await moveNoteToFolder(created.id, null);
		expect((await getNote(created.id)).folderId).toBeNull();

		await expect(moveNoteToFolder(created.id, crypto.randomUUID())).rejects.toBeInstanceOf(
			NotFoundError
		);
		await trashNote(created.id);
		await expect(moveNoteToFolder(created.id, home.id)).rejects.toBeInstanceOf(NotFoundError);
	});

	it('lists the notes of one place', async () => {
		const work = await createNoteFolder({ name: 'Work', parentId: null });
		const inFolder = await createNote({ title: 'In Work', folderId: work.id }, OWNER);
		const atTop = await createNote({ title: 'At top' }, OWNER);

		expect((await listNotes({ folderId: work.id })).map((item) => item.id)).toEqual([
			inFolder.id
		]);
		expect((await listNotes({ folderId: null })).map((item) => item.id)).toEqual([atTop.id]);
		expect(await listNotes()).toHaveLength(2);

		const page = await listNotePage({ folderId: work.id, limit: 10 });
		expect(page.map((item) => [item.id, item.folderId])).toEqual([[inFolder.id, work.id]]);
		expect(await listNotePage({ folderId: null, limit: 10 })).toHaveLength(1);
	});

	it('shows the folders as a tree in the sidebar', async () => {
		const work = await createNoteFolder({ name: 'Work', parentId: null });
		const atlas = await createNoteFolder({ name: 'Atlas', parentId: work.id });
		await createNote({ title: 'Deep', folderId: atlas.id }, OWNER);
		await createNote({ title: 'Loose' }, OWNER);

		const group = await notesServerManifest.sidebarGroup?.();
		expect(group?.items.map((item) => item.label)).toEqual([
			'Map Notes',
			'New Note',
			'Work',
			'Loose',
			'Show all'
		]);
		const folder = group?.items[2];
		expect(folder?.link).toEqual({ kind: 'internal', path: `/notes?folder=${work.id}` });
		expect(folder?.children?.map((item) => item.label)).toEqual(['Atlas']);
		expect(folder?.children?.[0].children?.map((item) => item.label)).toEqual(['Deep']);
	});

	it('counts the folders in the usage report', async () => {
		await createNoteFolder({ name: 'Work', parentId: null });
		const items = await notesUsage();
		expect(items.find((item) => item.id === 'notes.folders')).toMatchObject({ count: 1 });
	});

	it('keeps a note out of a folder that is deleted at the same time', async () => {
		const work = await createNoteFolder({ name: 'Work', parentId: null });
		const created = await createNote({ title: 'Racing' }, OWNER);
		// Both run at once: either the note gets in first and the folder stays, or the folder
		// goes first and the move fails. A note never ends up moved out without a word.
		const results = await Promise.allSettled([
			moveNoteToFolder(created.id, work.id),
			deleteNoteFolder(work.id)
		]);
		const [row] = await getDb()
			.select({ folderId: note.folderId })
			.from(note)
			.where(eq(note.id, created.id));
		if (results[1].status === 'fulfilled') {
			expect(results[0].status).toBe('rejected');
			if (results[0].status === 'rejected') {
				expect(results[0].reason).toBeInstanceOf(NotFoundError);
			}
			expect(row.folderId).toBeNull();
		} else {
			expect(results[0].status).toBe('fulfilled');
			expect(row.folderId).toBe(work.id);
		}
	});
});
