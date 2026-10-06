import { m } from '$lib/paraglide/messages.js';
import type { Actor } from '$lib/server/actor';
import { getDb } from '$lib/server/db';
import { file } from '$lib/server/db/schema';
import { ConflictError, NotFoundError, ValidationError } from '$lib/server/errors';
import { isUuid } from '$lib/utils/uuid';
import { fieldErrors } from '$lib/utils/validation';
import {
	and,
	desc,
	eq,
	ilike,
	inArray,
	isNotNull,
	isNull,
	lt,
	or,
	sql,
	type SQL
} from 'drizzle-orm';
import { emptyNoteContent, fileIdsInContent, type NoteContent } from './content';
import { contentToText, validateNoteContent } from './content.server';
import { note, noteFile, noteRevision } from './schema.server';
import { containsPattern, prefixQuery } from '$lib/server/search-query';
import { noteTitleSchema } from './schemas';
import type { NoteDetail, NoteRevisionSummary, NoteSummary, RevisionActorType } from './types';

export const NOTES_MODULE = 'notes';

const EXCERPT_LENGTH = 180;
const REVISION_WINDOW_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type Transaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

export interface NoteInput {
	title?: string;
	content?: unknown;
}

export interface ListNotesOptions {
	query?: string;
	trashed?: boolean;
	limit?: number;
}

function excerptOf(text: string): string {
	const flat = text.replace(/\s+/g, ' ').trim();
	if (flat.length <= EXCERPT_LENGTH) {
		return flat;
	}
	return `${flat.slice(0, EXCERPT_LENGTH).trimEnd()}…`;
}

function parseTitle(title: string | undefined, fallback: string): string {
	if (title === undefined) {
		return fallback;
	}
	const parsed = noteTitleSchema.safeParse(title);
	if (!parsed.success) {
		throw new ValidationError(fieldErrors(parsed.error));
	}
	return parsed.data;
}

function parseContent(content: unknown, fallback: NoteContent): NoteContent {
	if (content === undefined) {
		return fallback;
	}
	return validateNoteContent(content);
}

const summaryColumns = {
	id: note.id,
	title: note.title,
	// Enough text for the excerpt without reading whole documents.
	contentText: sql<string>`left(${note.contentText}, ${EXCERPT_LENGTH * 4})`,
	updatedAt: note.updatedAt,
	deletedAt: note.deletedAt
};

function toSummary(row: {
	id: string;
	title: string;
	contentText: string;
	updatedAt: Date;
	deletedAt: Date | null;
}): NoteSummary {
	return {
		id: row.id,
		title: row.title,
		excerpt: excerptOf(row.contentText),
		updatedAt: row.updatedAt,
		deletedAt: row.deletedAt
	};
}

/**
 * The search's rule for a note: a word of the text or title starts with each query word, or the
 * title contains the query or looks like it, as a whole or in some of its words (trigram
 * similarity and word similarity).
 */
function textMatch(query: string | undefined): SQL | undefined {
	const trimmed = query?.trim() ?? '';
	if (trimmed.length === 0) {
		return undefined;
	}
	const words = prefixQuery(trimmed);
	const fullText =
		words === null ? sql`false` : sql`${note.searchVector} @@ to_tsquery('simple', ${words})`;
	return or(
		fullText,
		ilike(note.title, containsPattern(trimmed)),
		sql`${note.title} % ${trimmed}`,
		// A typo in one word of a long title stays below the whole-title threshold.
		sql`${trimmed} <% ${note.title}`
	);
}

export interface NoteSearchHit {
	id: string;
	title: string;
	snippet: string;
	updatedAt: Date;
	/** From 0 to 1. */
	score: number;
}

/** Notes outside the trash that match the search rule, best first, each with a snippet. */
export async function searchNotes(query: string, limit: number): Promise<NoteSearchHit[]> {
	const trimmed = query.trim();
	const match = textMatch(trimmed);
	if (match === undefined) {
		return [];
	}
	const words = prefixQuery(trimmed);
	const tsquery = words === null ? sql`''::tsquery` : sql`to_tsquery('simple', ${words})`;
	// ts_rank_cd with normalization 32 stays below 1; a title containing the query ranks first.
	const score = sql<number>`greatest(
		ts_rank_cd(${note.searchVector}, ${tsquery}, 32),
		similarity(${note.title}, ${trimmed}),
		word_similarity(${trimmed}, ${note.title}),
		case when ${note.title} ilike ${containsPattern(trimmed)} then 0.9 else 0 end
	)::float8`;
	const rows = await getDb()
		.select({
			id: note.id,
			title: note.title,
			snippet: sql<string>`ts_headline('simple', left(${note.contentText}, 20000), ${tsquery}, 'StartSel="", StopSel="", MaxWords=24, MinWords=8, MaxFragments=1, FragmentDelimiter=" "')`,
			updatedAt: note.updatedAt,
			score
		})
		.from(note)
		.where(and(isNull(note.deletedAt), match))
		.orderBy(desc(score), desc(note.updatedAt))
		.limit(limit);
	return rows.map((row) => ({
		...row,
		snippet: excerptOf(row.snippet),
		score: Number(row.score)
	}));
}

export async function listNotes(options: ListNotesOptions = {}): Promise<NoteSummary[]> {
	const conditions = [isNull(note.deletedAt)];
	if (options.trashed === true) {
		conditions[0] = isNotNull(note.deletedAt);
	}
	const match = textMatch(options.query);
	if (match !== undefined) {
		conditions.push(match);
	}

	const rows = await getDb()
		.select(summaryColumns)
		.from(note)
		.where(and(...conditions))
		.orderBy(options.trashed === true ? desc(note.deletedAt) : desc(note.updatedAt))
		.limit(options.limit ?? 1000);
	return rows.map(toSummary);
}

async function findNote(id: string, includeTrashed: boolean): Promise<NoteDetail> {
	if (!isUuid(id)) {
		throw new NotFoundError('Note');
	}
	const [row] = await getDb().select().from(note).where(eq(note.id, id)).limit(1);
	if (row === undefined || (row.deletedAt !== null && !includeTrashed)) {
		throw new NotFoundError('Note');
	}
	return {
		id: row.id,
		title: row.title,
		content: row.content,
		version: row.version,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		deletedAt: row.deletedAt
	};
}

export async function getNote(id: string, options: { includeTrashed?: boolean } = {}) {
	return findNote(id, options.includeTrashed ?? false);
}

/**
 * Keeps `note_file` equal to the files the note shows: those in the new content, plus those an
 * older revision still shows, so restoring that revision brings its images back. Ids with no file
 * row are ignored. Runs after the revision is recorded.
 */
async function syncFiles(tx: Transaction, noteId: string, content: NoteContent): Promise<void> {
	const referenced = fileIdsInContent(content);
	const linked = await tx
		.select({ fileId: noteFile.fileId })
		.from(noteFile)
		.where(eq(noteFile.noteId, noteId));

	for (const { fileId } of linked) {
		if (referenced.includes(fileId)) {
			continue;
		}
		const [inRevision] = await tx
			.select({ id: noteRevision.id })
			.from(noteRevision)
			.where(
				and(
					eq(noteRevision.noteId, noteId),
					sql`${noteRevision.content}::text ilike ${`%/files/${fileId}%`}`
				)
			)
			.limit(1);
		if (inRevision === undefined) {
			await tx
				.delete(noteFile)
				.where(and(eq(noteFile.noteId, noteId), eq(noteFile.fileId, fileId)));
		}
	}

	if (referenced.length === 0) {
		return;
	}
	const existing = await tx
		.select({ id: file.id })
		.from(file)
		.where(inArray(file.id, referenced));
	if (existing.length > 0) {
		await tx
			.insert(noteFile)
			.values(existing.map((row) => ({ noteId, fileId: row.id })))
			.onConflictDoNothing();
	}
}

/**
 * Records the note state after a write. The owner's edits within five minutes of the previous
 * revision refresh that revision, so every editing session keeps its last state without one row
 * per autosave. Another actor, an older revision, or a forced revision (API, MCP, restores) adds
 * a new one.
 */
async function recordRevision(
	tx: Transaction,
	state: { noteId: string; version: number; title: string; content: NoteContent },
	actor: Actor,
	force: boolean,
	now: Date
): Promise<void> {
	const [latest] = await tx
		.select()
		.from(noteRevision)
		.where(eq(noteRevision.noteId, state.noteId))
		.orderBy(desc(noteRevision.version))
		.limit(1);

	const sameActor =
		latest !== undefined && latest.actorType === actor.type && latest.actorId === actor.id;
	const recent =
		latest !== undefined && now.getTime() - latest.createdAt.getTime() < REVISION_WINDOW_MS;

	if (!force && actor.type === 'owner' && sameActor && recent) {
		await tx
			.update(noteRevision)
			.set({
				version: state.version,
				title: state.title,
				content: state.content,
				updatedAt: now
			})
			.where(eq(noteRevision.id, latest.id));
		return;
	}

	let actorType: RevisionActorType = 'system';
	if (actor.type === 'owner' || actor.type === 'api_key' || actor.type === 'note_token') {
		actorType = actor.type;
	}
	await tx.insert(noteRevision).values({
		noteId: state.noteId,
		version: state.version,
		title: state.title,
		content: state.content,
		actorType,
		actorId: actor.id,
		createdAt: now,
		updatedAt: now
	});
}

export interface WriteOptions {
	/** Always start a new revision, as API and MCP writes and restores do. */
	forceRevision?: boolean;
	now?: Date;
}

function forcedFor(actor: Actor, options: WriteOptions): boolean {
	return options.forceRevision === true || actor.type !== 'owner';
}

/** Inserts a note inside the caller's transaction, for writes that create other rows with it. */
export async function insertNote(
	tx: Transaction,
	input: NoteInput,
	actor: Actor,
	options: WriteOptions = {}
): Promise<string> {
	const title = parseTitle(input.title, '');
	const content = parseContent(input.content, emptyNoteContent());
	const now = options.now ?? new Date();

	const [created] = await tx
		.insert(note)
		.values({
			title,
			content,
			contentText: contentToText(content),
			version: 1,
			createdAt: now,
			updatedAt: now
		})
		.returning({ id: note.id });
	await recordRevision(
		tx,
		{ noteId: created.id, version: 1, title, content },
		actor,
		forcedFor(actor, options),
		now
	);
	await syncFiles(tx, created.id, content);
	return created.id;
}

export async function createNote(
	input: NoteInput,
	actor: Actor,
	options: WriteOptions = {}
): Promise<NoteDetail> {
	const id = await getDb().transaction((tx) => insertNote(tx, input, actor, options));
	return findNote(id, false);
}

export interface NoteUpdate extends NoteInput {
	/** The version the edit was based on; a different stored version is a conflict. */
	baseVersion: number;
}

export async function updateNote(
	id: string,
	input: NoteUpdate,
	actor: Actor,
	options: WriteOptions = {}
): Promise<NoteDetail> {
	if (!isUuid(id)) {
		throw new NotFoundError('Note');
	}
	const now = options.now ?? new Date();

	await getDb().transaction(async (tx) => {
		const [current] = await tx
			.select()
			.from(note)
			.where(and(eq(note.id, id), isNull(note.deletedAt)))
			.for('update');
		if (current === undefined) {
			throw new NotFoundError('Note');
		}
		if (current.version !== input.baseVersion) {
			throw new ConflictError(current.version);
		}

		const title = parseTitle(input.title, current.title);
		const content = parseContent(input.content, current.content);
		const version = current.version + 1;

		await tx
			.update(note)
			.set({ title, content, contentText: contentToText(content), version, updatedAt: now })
			.where(eq(note.id, id));
		await recordRevision(
			tx,
			{ noteId: id, version, title, content },
			actor,
			forcedFor(actor, options),
			now
		);
		await syncFiles(tx, id, content);
	});
	return findNote(id, false);
}

/** Moves a note to the trash; its features and files stay until the trash is emptied. */
export async function trashNote(id: string, now = new Date()): Promise<void> {
	const found = await findNote(id, false);
	await getDb()
		.update(note)
		.set({ deletedAt: now })
		.where(and(eq(note.id, found.id), isNull(note.deletedAt)));
}

export async function restoreNote(id: string): Promise<NoteDetail> {
	const found = await findNote(id, true);
	if (found.deletedAt === null) {
		return found;
	}
	await getDb().update(note).set({ deletedAt: null }).where(eq(note.id, found.id));
	return findNote(found.id, false);
}

/** Deletes a trashed note for good, with its revisions; its files become unreferenced. */
export async function deleteNotePermanently(id: string): Promise<void> {
	const found = await findNote(id, true);
	if (found.deletedAt === null) {
		throw new ValidationError({ note: m.notes_error_not_trashed() });
	}
	await getDb().delete(note).where(eq(note.id, found.id));
}

export async function listRevisions(noteId: string): Promise<NoteRevisionSummary[]> {
	const found = await findNote(noteId, true);
	return getDb()
		.select({
			version: noteRevision.version,
			title: noteRevision.title,
			actorType: noteRevision.actorType,
			actorId: noteRevision.actorId,
			createdAt: noteRevision.createdAt,
			updatedAt: noteRevision.updatedAt
		})
		.from(noteRevision)
		.where(eq(noteRevision.noteId, found.id))
		.orderBy(desc(noteRevision.version));
}

export async function getRevision(noteId: string, version: number) {
	const found = await findNote(noteId, true);
	const [row] = await getDb()
		.select()
		.from(noteRevision)
		.where(and(eq(noteRevision.noteId, found.id), eq(noteRevision.version, version)))
		.limit(1);
	if (row === undefined) {
		throw new NotFoundError('Revision');
	}
	return row;
}

/** Writes a revision's title and content as a new version on top of the current one. */
export async function restoreRevision(
	noteId: string,
	version: number,
	actor: Actor,
	options: WriteOptions = {}
): Promise<NoteDetail> {
	const revision = await getRevision(noteId, version);
	const current = await findNote(noteId, false);
	return updateNote(
		noteId,
		{ title: revision.title, content: revision.content, baseVersion: current.version },
		actor,
		{ ...options, forceRevision: true }
	);
}

/** Deletes notes that have been in the trash longer than the retention period. */
export async function purgeTrashedNotes(now: Date, retentionDays: number): Promise<number> {
	const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
	const deleted = await getDb()
		.delete(note)
		.where(and(isNotNull(note.deletedAt), lt(note.deletedAt, cutoff)))
		.returning({ id: note.id });
	return deleted.length;
}

export interface NotePageOptions {
	query?: string;
	includeTrashed?: boolean;
	limit: number;
	/** The last note of the previous page. */
	after?: { updatedAt: Date; id: string };
}

/**
 * A page of notes by last update, for the API: one row more than `limit`, so the caller can tell
 * whether another page follows.
 */
export async function listNotePage(
	options: NotePageOptions
): Promise<(NoteSummary & { version: number })[]> {
	const conditions = [];
	if (options.includeTrashed !== true) {
		conditions.push(isNull(note.deletedAt));
	}
	const match = textMatch(options.query);
	if (match !== undefined) {
		conditions.push(match);
	}
	if (options.after !== undefined) {
		conditions.push(
			sql`(${note.updatedAt}, ${note.id}) < (${options.after.updatedAt.toISOString()}::timestamptz, ${options.after.id}::uuid)`
		);
	}
	const rows = await getDb()
		.select({ ...summaryColumns, version: note.version })
		.from(note)
		.where(and(...conditions))
		.orderBy(desc(note.updatedAt), desc(note.id))
		.limit(options.limit + 1);
	return rows.map((row) => ({ ...toSummary(row), version: row.version }));
}

/** Ids and titles of the notes outside the trash, newest first, for pickers. */
export async function listNoteTitles(): Promise<{ id: string; title: string }[]> {
	return getDb()
		.select({ id: note.id, title: note.title })
		.from(note)
		.where(isNull(note.deletedAt))
		.orderBy(desc(note.updatedAt))
		.limit(1000);
}

export async function countNotes(): Promise<number> {
	const [row] = await getDb()
		.select({ total: sql<number>`count(*)::int` })
		.from(note)
		.where(isNull(note.deletedAt));
	return row.total;
}
