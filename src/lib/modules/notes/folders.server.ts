import { m } from '$lib/paraglide/messages.js';
import { getDb } from '$lib/server/db';
import { FOREIGN_KEY_VIOLATION, hasErrorCode, UNIQUE_VIOLATION } from '$lib/server/db/errors';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { folderNameSchema } from '$lib/schemas/names';
import type { FolderOption } from '$lib/types/folders';
import { isUuid } from '$lib/utils/uuid';
import { and, asc, count, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { note, noteFolder } from './schema.server';
import type { NoteFolderPath, NoteFolderSummary } from './types';

// Folders of notes, nested like those of the Files module. Moving a note into a folder changes
// neither its version nor its last update: it is not an edit of the note, and an open editor keeps
// saving on top of the version it knows.

function parseName(value: string): string {
	const parsed = folderNameSchema.safeParse(value);
	if (!parsed.success) {
		throw new ValidationError({
			name: parsed.error.issues[0]?.message ?? m.validation_required()
		});
	}
	return parsed.data;
}

function nameTakenOr(error: unknown): unknown {
	if (hasErrorCode(error, UNIQUE_VIOLATION)) {
		return new ValidationError({ name: m.folders_error_name_taken() });
	}
	return error;
}

const optionColumns = { id: noteFolder.id, name: noteFolder.name, parentId: noteFolder.parentId };

/** A folder by id, or null when there is none. */
export async function getNoteFolder(id: string): Promise<FolderOption | null> {
	if (!isUuid(id)) {
		return null;
	}
	const [row] = await getDb()
		.select(optionColumns)
		.from(noteFolder)
		.where(eq(noteFolder.id, id))
		.limit(1);
	return row ?? null;
}

async function requireFolder(id: string): Promise<FolderOption> {
	const found = await getNoteFolder(id);
	if (found === null) {
		throw new NotFoundError('Folder');
	}
	return found;
}

/** The folders from the top down to `id`, `id` included; empty for an unknown id. */
export async function noteFolderPath(id: string): Promise<NoteFolderPath> {
	if (!isUuid(id)) {
		return [];
	}
	const rows = await getDb().execute<{ id: string; name: string }>(sql`
		with recursive path (id, name, parent_id, depth) as (
			select id, name, parent_id, 0 from note_folder where id = ${id}
			union all
			select folder.id, folder.name, folder.parent_id, path.depth + 1
			from note_folder folder join path on folder.id = path.parent_id
		)
		select id, name from path order by depth desc
	`);
	return rows.map((row) => ({ id: row.id, name: row.name }));
}

/** How many folders and notes outside the trash each of these folders holds directly. */
async function contentCounts(
	ids: string[]
): Promise<Map<string, { notes: number; folders: number }>> {
	const counts = new Map<string, { notes: number; folders: number }>();
	if (ids.length === 0) {
		return counts;
	}
	const [folders, notes] = await Promise.all([
		getDb()
			.select({ id: noteFolder.parentId, total: count() })
			.from(noteFolder)
			.where(inArray(noteFolder.parentId, ids))
			.groupBy(noteFolder.parentId),
		getDb()
			.select({ id: note.folderId, total: count() })
			.from(note)
			.where(and(inArray(note.folderId, ids), isNull(note.deletedAt)))
			.groupBy(note.folderId)
	]);
	for (const id of ids) {
		counts.set(id, { notes: 0, folders: 0 });
	}
	for (const row of folders) {
		const entry = counts.get(row.id ?? '');
		if (entry !== undefined) {
			entry.folders = row.total;
		}
	}
	for (const row of notes) {
		const entry = counts.get(row.id ?? '');
		if (entry !== undefined) {
			entry.notes = row.total;
		}
	}
	return counts;
}

/** The folders directly inside `parentId`, or at the top level for null, by name. */
export async function listNoteFolders(parentId: string | null): Promise<NoteFolderSummary[]> {
	let place = isNull(noteFolder.parentId);
	if (parentId !== null) {
		place = eq(noteFolder.parentId, parentId);
	}
	const rows = await getDb()
		.select(optionColumns)
		.from(noteFolder)
		.where(place)
		.orderBy(asc(sql`lower(${noteFolder.name})`));
	const counts = await contentCounts(rows.map((row) => row.id));
	return rows.map((row) => ({
		...row,
		noteCount: counts.get(row.id)?.notes ?? 0,
		folderCount: counts.get(row.id)?.folders ?? 0
	}));
}

/** Every folder by name, for folder pickers and the sidebar. */
export async function allNoteFolders(): Promise<FolderOption[]> {
	return getDb()
		.select(optionColumns)
		.from(noteFolder)
		.orderBy(asc(sql`lower(${noteFolder.name})`));
}

/** How many notes outside the trash each folder holds directly, by folder id. */
export async function noteCountsByFolder(): Promise<Record<string, number>> {
	const rows = await getDb()
		.select({ id: note.folderId, total: count() })
		.from(note)
		.where(and(isNotNull(note.folderId), isNull(note.deletedAt)))
		.groupBy(note.folderId);
	const counts: Record<string, number> = {};
	for (const row of rows) {
		if (row.id !== null) {
			counts[row.id] = row.total;
		}
	}
	return counts;
}

export async function countNoteFolders(): Promise<number> {
	const [row] = await getDb().select({ total: count() }).from(noteFolder);
	return row.total;
}

export async function createNoteFolder(input: {
	name: string;
	parentId: string | null;
}): Promise<FolderOption> {
	const name = parseName(input.name);
	if (input.parentId !== null) {
		await requireFolder(input.parentId);
	}
	try {
		const [row] = await getDb()
			.insert(noteFolder)
			.values({ name, parentId: input.parentId })
			.returning(optionColumns);
		return row;
	} catch (error) {
		throw nameTakenOr(error);
	}
}

export async function renameNoteFolder(id: string, name: string): Promise<FolderOption> {
	const cleaned = parseName(name);
	await requireFolder(id);
	try {
		const [row] = await getDb()
			.update(noteFolder)
			.set({ name: cleaned, updatedAt: new Date() })
			.where(eq(noteFolder.id, id))
			.returning(optionColumns);
		return row;
	} catch (error) {
		throw nameTakenOr(error);
	}
}

/** Moves a folder into another one, or to the top for null; never into itself or below it. */
export async function moveNoteFolder(id: string, targetId: string | null): Promise<FolderOption> {
	await requireFolder(id);
	if (targetId !== null) {
		await requireFolder(targetId);
		if ((await noteFolderPath(targetId)).some((crumb) => crumb.id === id)) {
			throw new ValidationError({ target: m.folders_error_move_into_itself() });
		}
	}
	try {
		const [row] = await getDb()
			.update(noteFolder)
			.set({ parentId: targetId, updatedAt: new Date() })
			.where(eq(noteFolder.id, id))
			.returning(optionColumns);
		return row;
	} catch (error) {
		throw nameTakenOr(error);
	}
}

/**
 * Deletes an empty folder: one with folders or notes outside the trash inside is refused. Notes in
 * the trash that were in it move to the top level, where restoring them puts them back.
 */
export async function deleteNoteFolder(id: string): Promise<void> {
	await requireFolder(id);
	const counts = (await contentCounts([id])).get(id);
	if (counts !== undefined && counts.folders + counts.notes > 0) {
		throw new ValidationError({ folder: m.folders_error_not_empty() });
	}
	try {
		await getDb().transaction(async (tx) => {
			// The foreign key would quietly move a note out that was moved in meanwhile. Moving a
			// note in checks the key with a share lock on the folder's row, so locking that row
			// first makes such a move wait, and the count below sees every note that got in.
			await tx
				.select({ id: noteFolder.id })
				.from(noteFolder)
				.where(eq(noteFolder.id, id))
				.for('update');
			const [live] = await tx
				.select({ total: count() })
				.from(note)
				.where(and(eq(note.folderId, id), isNull(note.deletedAt)));
			if (live.total > 0) {
				throw new ValidationError({ folder: m.folders_error_not_empty() });
			}
			await tx.delete(noteFolder).where(eq(noteFolder.id, id));
		});
	} catch (error) {
		// A folder was created inside meanwhile.
		if (hasErrorCode(error, FOREIGN_KEY_VIOLATION)) {
			throw new ValidationError({ folder: m.folders_error_not_empty() });
		}
		throw error;
	}
}

/** Puts a note outside the trash into a folder, or at the top level for null. */
export async function moveNoteToFolder(noteId: string, folderId: string | null): Promise<void> {
	if (folderId !== null) {
		await requireFolder(folderId);
	}
	if (!isUuid(noteId)) {
		throw new NotFoundError('Note');
	}
	let moved: { id: string }[];
	try {
		moved = await getDb()
			.update(note)
			.set({ folderId })
			.where(and(eq(note.id, noteId), isNull(note.deletedAt)))
			.returning({ id: note.id });
	} catch (error) {
		// The folder was deleted meanwhile.
		if (hasErrorCode(error, FOREIGN_KEY_VIOLATION)) {
			throw new NotFoundError('Folder');
		}
		throw error;
	}
	if (moved.length === 0) {
		throw new NotFoundError('Note');
	}
}
