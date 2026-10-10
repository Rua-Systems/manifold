import { m } from '$lib/paraglide/messages.js';
import { fileReferences, moduleFileUses } from '$lib/modules/registry.server';
import { getDb } from '$lib/server/db';
import { file } from '$lib/server/db/schema';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import {
	changeFileOwner,
	deleteUnreferencedFile,
	renameStoredFile,
	unreferencedBy,
	type FileReference
} from '$lib/server/files/files';
import { containsPattern } from '$lib/server/search-query';
import type { FileUse } from '$lib/types/files';
import { fileKind, previewableTypes, typesOfKind } from '$lib/utils/file-kind';
import { isUuid } from '$lib/utils/uuid';
import {
	and,
	asc,
	count,
	desc,
	eq,
	ilike,
	inArray,
	isNotNull,
	isNull,
	notInArray,
	or,
	sql,
	sum,
	type SQL
} from 'drizzle-orm';
import type { z } from 'zod';
import { FILES_LIST_LIMIT, FILES_MODULE } from './constants';
import { sourceLabel, sourceRank } from './labels';
import { fileEntry, fileFolder } from './schema.server';
import { fileNameSchema, folderNameSchema } from './schemas';
import type {
	FileDetail,
	FilesFilter,
	FileSummary,
	FilesSort,
	FolderCrumb,
	FolderSummary,
	PickedFile,
	SourceSummary
} from './types';

// The Files page's view of stored files: the folders of the Files module, the files other modules
// keep, and the rules for changing them. A file is in use while any module other than this one
// refers to it, and a file in use is never deleted.

const fileColumns = {
	id: file.id,
	name: file.originalName,
	mimeType: file.mimeType,
	sizeBytes: file.sizeBytes,
	createdAt: file.createdAt,
	ownerModule: file.ownerModule,
	entry: fileEntry.fileId,
	folderId: fileEntry.folderId
};

interface FileRow {
	id: string;
	name: string;
	mimeType: string;
	sizeBytes: number;
	createdAt: Date;
	ownerModule: string;
	entry: string | null;
	folderId: string | null;
}

/** The references that put a file in use: every module's, but not the Files module's own. */
function useReferences(): FileReference[] {
	return fileReferences().filter((reference) => reference.table !== 'file_entry');
}

function parseName(schema: z.ZodType<string>, value: string): string {
	const parsed = schema.safeParse(value);
	if (!parsed.success) {
		throw new ValidationError({
			name: parsed.error.issues[0]?.message ?? m.validation_required()
		});
	}
	return parsed.data;
}

/** Postgres' unique violation, also when Drizzle wraps the driver's error. */
function hasErrorCode(error: unknown, code: string): boolean {
	let current: unknown = error;
	while (current instanceof Error) {
		if ((current as { code?: unknown }).code === code) {
			return true;
		}
		current = current.cause;
	}
	return false;
}

function nameTakenOr(error: unknown): unknown {
	if (hasErrorCode(error, '23505')) {
		return new ValidationError({ name: m.files_error_name_taken() });
	}
	return error;
}

function orderFor(sort: FilesSort): SQL[] {
	switch (sort) {
		case 'oldest':
			return [asc(file.createdAt)];
		case 'name':
			return [asc(sql`lower(${file.originalName})`), desc(file.createdAt)];
		case 'size':
			return [desc(file.sizeBytes), desc(file.createdAt)];
		default:
			return [desc(file.createdAt)];
	}
}

async function summaries(rows: FileRow[]): Promise<FileSummary[]> {
	const byFile = new Map<string, FileUse[]>();
	for (const use of await moduleFileUses(rows.map((row) => row.id))) {
		const uses = byFile.get(use.fileId) ?? [];
		uses.push(use);
		byFile.set(use.fileId, uses);
	}
	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		mimeType: row.mimeType,
		kind: fileKind(row.mimeType),
		sizeBytes: row.sizeBytes,
		createdAt: row.createdAt,
		ownerModule: row.ownerModule,
		inFiles: row.entry !== null,
		folderId: row.folderId,
		uses: byFile.get(row.id) ?? []
	}));
}

async function selectFiles(
	where: SQL | undefined,
	sort: FilesSort,
	limit = FILES_LIST_LIMIT
): Promise<FileRow[]> {
	return getDb()
		.select(fileColumns)
		.from(file)
		.leftJoin(fileEntry, eq(fileEntry.fileId, file.id))
		.where(where)
		.orderBy(...orderFor(sort))
		.limit(limit);
}

export async function getFolder(id: string): Promise<FolderSummary | null> {
	if (!isUuid(id)) {
		return null;
	}
	const [row] = await getDb()
		.select({ id: fileFolder.id, name: fileFolder.name, parentId: fileFolder.parentId })
		.from(fileFolder)
		.where(eq(fileFolder.id, id))
		.limit(1);
	if (row === undefined) {
		return null;
	}
	return { ...row, itemCount: 0 };
}

async function requireFolder(id: string): Promise<FolderSummary> {
	const found = await getFolder(id);
	if (found === null) {
		throw new NotFoundError('Folder');
	}
	return found;
}

/** The folders from the top down to `id`, `id` included. */
export async function folderPath(id: string): Promise<FolderCrumb[]> {
	const rows = await getDb().execute<{ id: string; name: string }>(sql`
		with recursive path (id, name, parent_id, depth) as (
			select id, name, parent_id, 0 from file_folder where id = ${id}
			union all
			select folder.id, folder.name, folder.parent_id, path.depth + 1
			from file_folder folder join path on folder.id = path.parent_id
		)
		select id, name from path order by depth desc
	`);
	return rows.map((row) => ({ id: row.id, name: row.name }));
}

/** How many folders and files each of these folders holds directly. */
async function itemCounts(ids: string[]): Promise<Map<string, number>> {
	const counts = new Map<string, number>();
	if (ids.length === 0) {
		return counts;
	}
	const [folders, files] = await Promise.all([
		getDb()
			.select({ id: fileFolder.parentId, total: count() })
			.from(fileFolder)
			.where(inArray(fileFolder.parentId, ids))
			.groupBy(fileFolder.parentId),
		getDb()
			.select({ id: fileEntry.folderId, total: count() })
			.from(fileEntry)
			.where(inArray(fileEntry.folderId, ids))
			.groupBy(fileEntry.folderId)
	]);
	for (const row of [...folders, ...files]) {
		if (row.id !== null) {
			counts.set(row.id, (counts.get(row.id) ?? 0) + row.total);
		}
	}
	return counts;
}

async function childFolders(parentId: string | null): Promise<FolderSummary[]> {
	let place = isNull(fileFolder.parentId);
	if (parentId !== null) {
		place = eq(fileFolder.parentId, parentId);
	}
	const rows = await getDb()
		.select({ id: fileFolder.id, name: fileFolder.name, parentId: fileFolder.parentId })
		.from(fileFolder)
		.where(place)
		.orderBy(asc(sql`lower(${fileFolder.name})`));
	const counts = await itemCounts(rows.map((row) => row.id));
	return rows.map((row) => ({ ...row, itemCount: counts.get(row.id) ?? 0 }));
}

/** A folder of the Files module, or its top level for null: its folders and its files. */
export async function listFolder(
	folderId: string | null,
	sort: FilesSort
): Promise<{ folders: FolderSummary[]; files: FileSummary[] }> {
	let place = and(isNotNull(fileEntry.fileId), isNull(fileEntry.folderId));
	if (folderId !== null) {
		place = eq(fileEntry.folderId, folderId);
	}
	const [folders, rows] = await Promise.all([childFolders(folderId), selectFiles(place, sort)]);
	return { folders, files: await summaries(rows) };
}

/** Every folder, for choosing where to move something. */
export async function allFolders(): Promise<FolderSummary[]> {
	const rows = await getDb()
		.select({ id: fileFolder.id, name: fileFolder.name, parentId: fileFolder.parentId })
		.from(fileFolder)
		.orderBy(asc(sql`lower(${fileFolder.name})`));
	return rows.map((row) => ({ ...row, itemCount: 0 }));
}

/** The modules that keep files of their own, such as notes with their images. */
export async function listSources(): Promise<SourceSummary[]> {
	const rows = await getDb()
		.select({ module: file.ownerModule, fileCount: count() })
		.from(file)
		.leftJoin(fileEntry, eq(fileEntry.fileId, file.id))
		.where(isNull(fileEntry.fileId))
		.groupBy(file.ownerModule);
	return rows
		.map((row) => ({
			module: row.module,
			label: sourceLabel(row.module),
			fileCount: Number(row.fileCount)
		}))
		.sort((first, second) => sourceRank(first.module) - sourceRank(second.module));
}

/** The files a module keeps itself, outside the folders of the Files module. */
export async function listSource(module: string, sort: FilesSort): Promise<FileSummary[]> {
	const rows = await selectFiles(
		and(eq(file.ownerModule, module), isNull(fileEntry.fileId)),
		sort
	);
	return summaries(rows);
}

function filterConditions(filter: FilesFilter): SQL[] {
	const conditions: SQL[] = [];
	const query = filter.query.trim();
	if (query !== '') {
		conditions.push(ilike(file.originalName, containsPattern(query)));
	}
	if (filter.kind === 'other') {
		conditions.push(notInArray(file.mimeType, previewableTypes()));
	} else if (filter.kind !== 'all') {
		conditions.push(inArray(file.mimeType, typesOfKind(filter.kind)));
	}
	if (filter.unused) {
		conditions.push(...unreferencedBy(useReferences()));
	}
	return conditions;
}

export interface FilePageQuery {
	/** Files in this folder of the Files module; `''` for its top level, undefined for anywhere. */
	folderId?: string;
	/** Files that this module keeps. */
	owner?: string;
	filter: FilesFilter;
	limit: number;
	/** The last file of the previous page. */
	after?: { createdAt: Date; id: string };
}

/** A page of files, newest first, with one more than `limit` to tell whether more follow. */
export async function listFilePage(query: FilePageQuery): Promise<FileSummary[]> {
	const conditions = filterConditions(query.filter);
	if (query.folderId === '') {
		conditions.push(isNull(fileEntry.folderId), isNotNull(fileEntry.fileId));
	} else if (query.folderId !== undefined) {
		conditions.push(eq(fileEntry.folderId, query.folderId));
	}
	if (query.owner !== undefined) {
		conditions.push(eq(file.ownerModule, query.owner));
	}
	if (query.after !== undefined) {
		conditions.push(
			sql`(${file.createdAt}, ${file.id}) < (${query.after.createdAt}, ${query.after.id})`
		);
	}
	const rows = await getDb()
		.select(fileColumns)
		.from(file)
		.leftJoin(fileEntry, eq(fileEntry.fileId, file.id))
		.where(and(...conditions))
		.orderBy(desc(file.createdAt), desc(file.id))
		.limit(query.limit + 1);
	return summaries(rows);
}

/** Hands stored files, such as API uploads, to the Files module, in a folder or at the top. */
export async function adoptIntoFiles(fileIds: string[], folderId: string | null): Promise<void> {
	if (folderId !== null) {
		await requireFolder(folderId);
	}
	await changeFileOwner(fileIds, FILES_MODULE);
	await keepUploads(fileIds, folderId);
}

/** The newest files whose name contains `query`, without their uses, for the editor's picker. */
export async function pickableFiles(query: string, limit: number): Promise<PickedFile[]> {
	const rows = await selectFiles(
		and(...filterConditions({ query, kind: 'all', unused: false })),
		'newest',
		limit
	);
	return rows.map((row) => ({
		id: row.id,
		src: `/files/${row.id}`,
		name: row.name,
		sizeBytes: row.sizeBytes,
		mimeType: row.mimeType,
		kind: fileKind(row.mimeType)
	}));
}

/** Files from everywhere that match the filter. */
export async function filterFiles(filter: FilesFilter, sort: FilesSort): Promise<FileSummary[]> {
	return summaries(await selectFiles(and(...filterConditions(filter)), sort));
}

/** Files whose names match, best first, for the search and the command palette. */
export async function searchFiles(
	query: string,
	limit: number
): Promise<(FileSummary & { score: number })[]> {
	const pattern = containsPattern(query);
	const score = sql<number>`greatest(
		similarity(${file.originalName}, ${query}),
		word_similarity(${query}, ${file.originalName}),
		case when ${file.originalName} ilike ${pattern} then 0.9 else 0 end
	)::float8`;
	const rows = await getDb()
		.select({ ...fileColumns, score })
		.from(file)
		.leftJoin(fileEntry, eq(fileEntry.fileId, file.id))
		.where(
			or(
				ilike(file.originalName, pattern),
				sql`${file.originalName} % ${query}`,
				sql`${query} <% ${file.originalName}`
			)
		)
		.orderBy(desc(score), desc(file.createdAt))
		.limit(limit);
	const found = await summaries(rows);
	return found.map((item, index) => ({ ...item, score: Number(rows[index].score) }));
}

/** One file with where it lives, or null. */
export async function getFileDetail(id: string): Promise<FileDetail | null> {
	if (!isUuid(id)) {
		return null;
	}
	const rows = await selectFiles(eq(file.id, id), 'newest');
	const [found] = await summaries(rows);
	if (found === undefined) {
		return null;
	}
	if (!found.inFiles) {
		return {
			...found,
			location: {
				kind: 'source',
				module: found.ownerModule,
				label: sourceLabel(found.ownerModule)
			}
		};
	}
	let path: FolderCrumb[] = [];
	if (found.folderId !== null) {
		path = await folderPath(found.folderId);
	}
	return { ...found, location: { kind: 'folder', path } };
}

export async function createFolder(input: {
	name: string;
	parentId: string | null;
}): Promise<FolderSummary> {
	const name = parseName(folderNameSchema, input.name);
	if (input.parentId !== null) {
		await requireFolder(input.parentId);
	}
	try {
		const [row] = await getDb()
			.insert(fileFolder)
			.values({ name, parentId: input.parentId })
			.returning({ id: fileFolder.id, name: fileFolder.name, parentId: fileFolder.parentId });
		return { ...row, itemCount: 0 };
	} catch (error) {
		throw nameTakenOr(error);
	}
}

export async function renameFolder(id: string, name: string): Promise<void> {
	const cleaned = parseName(folderNameSchema, name);
	await requireFolder(id);
	try {
		await getDb()
			.update(fileFolder)
			.set({ name: cleaned, updatedAt: new Date() })
			.where(eq(fileFolder.id, id));
	} catch (error) {
		throw nameTakenOr(error);
	}
}

/** Moves a folder into another one, or to the top for null; never into itself or below it. */
export async function moveFolder(id: string, targetId: string | null): Promise<void> {
	await requireFolder(id);
	if (targetId !== null) {
		await requireFolder(targetId);
		if ((await folderPath(targetId)).some((crumb) => crumb.id === id)) {
			throw new ValidationError({ target: m.files_error_move_into_itself() });
		}
	}
	try {
		await getDb()
			.update(fileFolder)
			.set({ parentId: targetId, updatedAt: new Date() })
			.where(eq(fileFolder.id, id));
	} catch (error) {
		throw nameTakenOr(error);
	}
}

/** Deletes an empty folder; one with folders or files inside is refused. */
export async function deleteFolder(id: string): Promise<void> {
	await requireFolder(id);
	const [folders] = await getDb()
		.select({ total: count() })
		.from(fileFolder)
		.where(eq(fileFolder.parentId, id));
	const [files] = await getDb()
		.select({ total: count() })
		.from(fileEntry)
		.where(eq(fileEntry.folderId, id));
	if (folders.total + files.total > 0) {
		throw new ValidationError({ folder: m.files_error_folder_not_empty() });
	}
	try {
		await getDb().delete(fileFolder).where(eq(fileFolder.id, id));
	} catch (error) {
		// Something was put inside meanwhile.
		if (hasErrorCode(error, '23503')) {
			throw new ValidationError({ folder: m.files_error_folder_not_empty() });
		}
		throw error;
	}
}

/** Keeps freshly stored files in the Files module, in a folder or at the top. */
export async function keepUploads(fileIds: string[], folderId: string | null): Promise<void> {
	if (fileIds.length === 0) {
		return;
	}
	await getDb()
		.insert(fileEntry)
		.values(fileIds.map((fileId) => ({ fileId, folderId })));
}

/** A file of the Files module; a file another module keeps cannot be renamed or moved here. */
async function requireEntry(id: string): Promise<void> {
	if (!isUuid(id)) {
		throw new NotFoundError('File');
	}
	const [entry] = await getDb()
		.select({ fileId: fileEntry.fileId })
		.from(fileEntry)
		.where(eq(fileEntry.fileId, id))
		.limit(1);
	if (entry !== undefined) {
		return;
	}
	const [stored] = await getDb().select({ id: file.id }).from(file).where(eq(file.id, id));
	if (stored === undefined) {
		throw new NotFoundError('File');
	}
	throw new ValidationError({ file: m.files_error_not_in_files() });
}

export async function renameFile(id: string, name: string): Promise<void> {
	const cleaned = parseName(fileNameSchema, name);
	await requireEntry(id);
	await renameStoredFile(id, cleaned);
}

export async function moveFiles(ids: string[], targetId: string | null): Promise<void> {
	for (const id of ids) {
		await requireEntry(id);
	}
	if (targetId !== null) {
		await requireFolder(targetId);
	}
	await getDb()
		.update(fileEntry)
		.set({ folderId: targetId })
		.where(inArray(fileEntry.fileId, ids));
}

/** Deletes a file that nothing uses, with its bytes; a file in use is refused. */
export async function deleteFile(id: string): Promise<void> {
	if (!isUuid(id)) {
		throw new NotFoundError('File');
	}
	if (await deleteUnreferencedFile(id, useReferences())) {
		return;
	}
	const [stored] = await getDb().select({ id: file.id }).from(file).where(eq(file.id, id));
	if (stored === undefined) {
		throw new NotFoundError('File');
	}
	throw new ValidationError({ file: m.files_error_in_use() });
}

export interface FilesTotals {
	files: number;
	bytes: number;
	byKind: Map<string, number>;
}

/** How many files there are and how much room they take, overall and by kind. */
export async function fileTotals(): Promise<FilesTotals> {
	const rows = await getDb()
		.select({ mimeType: file.mimeType, files: count(), bytes: sum(file.sizeBytes) })
		.from(file)
		.groupBy(file.mimeType);
	const totals: FilesTotals = { files: 0, bytes: 0, byKind: new Map() };
	for (const row of rows) {
		const files = Number(row.files);
		totals.files += files;
		totals.bytes += Number(row.bytes ?? 0);
		const kind = fileKind(row.mimeType);
		totals.byKind.set(kind, (totals.byKind.get(kind) ?? 0) + files);
	}
	return totals;
}

/** The most recently stored files, wherever they are. */
export async function recentFiles(limit: number): Promise<FileSummary[]> {
	const rows = await getDb()
		.select(fileColumns)
		.from(file)
		.leftJoin(fileEntry, eq(fileEntry.fileId, file.id))
		.orderBy(desc(file.createdAt))
		.limit(limit);
	return summaries(rows);
}
