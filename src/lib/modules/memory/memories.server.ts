import { m } from '$lib/paraglide/messages.js';
import type { Actor } from '$lib/server/actor';
import { getDb, type Transaction } from '$lib/server/db';
import { apiKey, tag } from '$lib/server/db/schema';
import { ConflictError, NotFoundError, ValidationError } from '$lib/server/errors';
import { containsPattern, prefixQuery } from '$lib/server/search-query';
import type { Tag } from '$lib/types/tags';
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
	lt,
	or,
	sql,
	type SQL
} from 'drizzle-orm';
import { emptyNoteContent, type NoteContent } from '../notes/content';
import { contentToText } from '../notes/content.server';
import { accessCondition, FULL_ACCESS, reaches, type MemoryAccess } from './access.server';
import { validateMemoryContent } from './content.server';
import { memory, memoryCategory, memoryRevision, memoryTag } from './schema.server';
import { memoryTitleSchema } from './schemas';
import type { MemoryActorType, MemoryDetail, MemoryRevisionSummary, MemorySummary } from './types';

export const MEMORY_MODULE = 'memory';

const EXCERPT_LENGTH = 180;
const REVISION_WINDOW_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** At most this many pinned memories go into an agent's context at once. */
export const PINNED_CONTEXT_LIMIT = 50;

export interface NewMemoryInput {
	title: string;
	content?: unknown;
	/** Null for none; a key limited to categories must name one of them. */
	categoryId?: string | null;
	/** Resolved by the caller from ids or names. */
	tags?: Tag[];
	pinned?: boolean;
}

export interface MemoryUpdate {
	/**
	 * The version a change of the title or the content is based on; a different stored version is
	 * a conflict. Needed whenever the title or the content is sent.
	 */
	baseVersion?: number;
	title?: string;
	content?: unknown;
	categoryId?: string | null;
	tags?: Tag[];
	pinned?: boolean;
}

export interface WriteOptions {
	/** Always start a new revision, as API and MCP writes and restores do. */
	forceRevision?: boolean;
	now?: Date;
}

function excerptOf(text: string): string {
	const flat = text.replace(/\s+/g, ' ').trim();
	if (flat.length <= EXCERPT_LENGTH) {
		return flat;
	}
	return `${flat.slice(0, EXCERPT_LENGTH).trimEnd()}…`;
}

function parseTitle(title: string): string {
	const parsed = memoryTitleSchema.safeParse(title);
	if (!parsed.success) {
		throw new ValidationError({
			title: parsed.error.issues[0]?.message ?? m.validation_required()
		});
	}
	return parsed.data;
}

/** JSON with the keys of every object sorted, since jsonb does not keep the order they came in. */
function canonical(value: unknown): string {
	return JSON.stringify(value, (_key, item: unknown) => {
		if (item === null || typeof item !== 'object' || Array.isArray(item)) {
			return item;
		}
		return Object.fromEntries(
			Object.entries(item as Record<string, unknown>).sort(([first], [second]) =>
				first.localeCompare(second)
			)
		);
	});
}

function notFound(): NotFoundError {
	return new NotFoundError('Memory');
}

/** The tags of these memories by memory id, each list by name. */
async function tagsOf(ids: string[]): Promise<Map<string, Tag[]>> {
	const tags = new Map<string, Tag[]>();
	if (ids.length === 0) {
		return tags;
	}
	const rows = await getDb()
		.select({ memoryId: memoryTag.memoryId, id: tag.id, name: tag.name, color: tag.color })
		.from(memoryTag)
		.innerJoin(tag, eq(tag.id, memoryTag.tagId))
		.where(inArray(memoryTag.memoryId, ids))
		.orderBy(asc(sql`lower(${tag.name})`));
	for (const row of rows) {
		tags.set(row.memoryId, [
			...(tags.get(row.memoryId) ?? []),
			{ id: row.id, name: row.name, color: row.color }
		]);
	}
	return tags;
}

/**
 * Checks that a memory may go into this category: the category exists and is within the caller's
 * reach. A key limited to categories cannot leave a memory without one.
 */
async function requireCategoryFor(
	categoryId: string | null,
	access: MemoryAccess
): Promise<string | null> {
	if (categoryId === null) {
		if (!access.all) {
			throw new ValidationError({ category: m.memory_error_category_needed() });
		}
		return null;
	}
	if (isUuid(categoryId) && reaches(access, categoryId)) {
		const [row] = await getDb()
			.select({ id: memoryCategory.id })
			.from(memoryCategory)
			.where(eq(memoryCategory.id, categoryId))
			.limit(1);
		if (row !== undefined) {
			return row.id;
		}
	}
	throw new ValidationError({ category: m.memory_categories_error_missing() });
}

async function setTags(tx: Transaction, memoryId: string, tags: Tag[]): Promise<void> {
	await tx.delete(memoryTag).where(eq(memoryTag.memoryId, memoryId));
	const ids = [...new Set(tags.map((item) => item.id))];
	if (ids.length > 0) {
		await tx.insert(memoryTag).values(ids.map((tagId) => ({ memoryId, tagId })));
	}
}

function actorTypeOf(actor: Actor): MemoryActorType {
	if (actor.type === 'owner' || actor.type === 'api_key') {
		return actor.type;
	}
	return 'system';
}

/**
 * Records the memory's state after a write. The owner's saves within five minutes of the previous
 * revision refresh that revision, so one sitting keeps its last state without a row per save.
 * Another writer, an older revision, or a forced revision (API, MCP, restores) adds a new one.
 */
async function recordRevision(
	tx: Transaction,
	state: { memoryId: string; version: number; title: string; content: NoteContent },
	actor: Actor,
	force: boolean,
	now: Date
): Promise<void> {
	const actorType = actorTypeOf(actor);
	const [latest] = await tx
		.select()
		.from(memoryRevision)
		.where(eq(memoryRevision.memoryId, state.memoryId))
		.orderBy(desc(memoryRevision.version))
		.limit(1);

	const sameActor =
		latest !== undefined && latest.actorType === actorType && latest.actorId === actor.id;
	const recent =
		latest !== undefined && now.getTime() - latest.createdAt.getTime() < REVISION_WINDOW_MS;

	if (!force && sameActor && recent) {
		await tx
			.update(memoryRevision)
			.set({
				version: state.version,
				title: state.title,
				content: state.content,
				updatedAt: now
			})
			.where(eq(memoryRevision.id, latest.id));
		return;
	}
	await tx.insert(memoryRevision).values({
		memoryId: state.memoryId,
		version: state.version,
		title: state.title,
		content: state.content,
		actorType,
		actorId: actor.id,
		createdAt: now,
		updatedAt: now
	});
}

function forcedFor(actor: Actor, options: WriteOptions): boolean {
	return options.forceRevision === true || actor.type !== 'owner';
}

async function findMemory(
	id: string,
	includeTrashed: boolean,
	access: MemoryAccess
): Promise<MemoryDetail> {
	if (!isUuid(id)) {
		throw notFound();
	}
	const [row] = await getDb()
		.select()
		.from(memory)
		.where(and(eq(memory.id, id), accessCondition(access)))
		.limit(1);
	if (row === undefined || (row.deletedAt !== null && !includeTrashed)) {
		throw notFound();
	}
	const tags = await tagsOf([row.id]);
	return {
		id: row.id,
		title: row.title,
		content: row.content,
		version: row.version,
		categoryId: row.categoryId,
		pinned: row.pinned,
		tags: tags.get(row.id) ?? [],
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		deletedAt: row.deletedAt
	};
}

export async function getMemory(
	id: string,
	options: { includeTrashed?: boolean } = {},
	access: MemoryAccess = FULL_ACCESS
): Promise<MemoryDetail> {
	return findMemory(id, options.includeTrashed ?? false, access);
}

export async function createMemory(
	input: NewMemoryInput,
	actor: Actor,
	access: MemoryAccess = FULL_ACCESS,
	options: WriteOptions = {}
): Promise<MemoryDetail> {
	const title = parseTitle(input.title);
	let content = emptyNoteContent();
	if (input.content !== undefined) {
		content = validateMemoryContent(input.content);
	}
	const categoryId = await requireCategoryFor(input.categoryId ?? null, access);
	const now = options.now ?? new Date();

	const id = await getDb().transaction(async (tx) => {
		const [created] = await tx
			.insert(memory)
			.values({
				title,
				content,
				contentText: contentToText(content),
				categoryId,
				pinned: input.pinned ?? false,
				version: 1,
				createdAt: now,
				updatedAt: now
			})
			.returning({ id: memory.id });
		await recordRevision(
			tx,
			{ memoryId: created.id, version: 1, title, content },
			actor,
			forcedFor(actor, options),
			now
		);
		await setTags(tx, created.id, input.tags ?? []);
		return created.id;
	});
	return findMemory(id, false, access);
}

/**
 * Changes a memory. A new title or content makes a new version, based on `baseVersion`; the
 * category, the tags and the pin change in place, without a version, like moving a note.
 */
export async function updateMemory(
	id: string,
	update: MemoryUpdate,
	actor: Actor,
	access: MemoryAccess = FULL_ACCESS,
	options: WriteOptions = {}
): Promise<MemoryDetail> {
	if (!isUuid(id)) {
		throw notFound();
	}
	const now = options.now ?? new Date();
	let categoryId: string | null | undefined;
	if (update.categoryId !== undefined) {
		categoryId = await requireCategoryFor(update.categoryId, access);
	}
	let title: string | undefined;
	if (update.title !== undefined) {
		title = parseTitle(update.title);
	}
	let content: NoteContent | undefined;
	if (update.content !== undefined) {
		content = validateMemoryContent(update.content);
	}
	if ((title !== undefined || content !== undefined) && update.baseVersion === undefined) {
		throw new ValidationError({ version: m.memory_error_version_needed() });
	}

	await getDb().transaction(async (tx) => {
		const [current] = await tx
			.select()
			.from(memory)
			.where(and(eq(memory.id, id), isNull(memory.deletedAt), accessCondition(access)))
			.for('update');
		if (current === undefined) {
			throw notFound();
		}
		if (update.baseVersion !== undefined && current.version !== update.baseVersion) {
			throw new ConflictError(current.version);
		}

		const nextTitle = title ?? current.title;
		const nextContent = content ?? current.content;
		const rewritten =
			nextTitle !== current.title || canonical(nextContent) !== canonical(current.content);
		let version = current.version;
		if (rewritten) {
			version = current.version + 1;
		}
		let nextCategory = current.categoryId;
		if (categoryId !== undefined) {
			nextCategory = categoryId;
		}

		await tx
			.update(memory)
			.set({
				title: nextTitle,
				content: nextContent,
				contentText: contentToText(nextContent),
				version,
				categoryId: nextCategory,
				pinned: update.pinned ?? current.pinned,
				updatedAt: now
			})
			.where(eq(memory.id, id));
		if (rewritten) {
			await recordRevision(
				tx,
				{ memoryId: id, version, title: nextTitle, content: nextContent },
				actor,
				forcedFor(actor, options),
				now
			);
		}
		if (update.tags !== undefined) {
			await setTags(tx, id, update.tags);
		}
	});
	return findMemory(id, false, access);
}

/** Moves a memory to the trash; it stays there until it is restored or the trash is emptied. */
export async function trashMemory(
	id: string,
	access: MemoryAccess = FULL_ACCESS,
	now = new Date()
): Promise<void> {
	const found = await findMemory(id, false, access);
	await getDb()
		.update(memory)
		.set({ deletedAt: now })
		.where(and(eq(memory.id, found.id), isNull(memory.deletedAt)));
}

export async function restoreMemory(
	id: string,
	access: MemoryAccess = FULL_ACCESS
): Promise<MemoryDetail> {
	const found = await findMemory(id, true, access);
	if (found.deletedAt === null) {
		return found;
	}
	await getDb().update(memory).set({ deletedAt: null }).where(eq(memory.id, found.id));
	return findMemory(found.id, false, access);
}

/** Deletes a trashed memory for good, with its revisions. Only the owner does this. */
export async function deleteMemoryPermanently(id: string): Promise<void> {
	const found = await findMemory(id, true, FULL_ACCESS);
	if (found.deletedAt === null) {
		throw new ValidationError({ memory: m.memory_error_not_trashed() });
	}
	await getDb().delete(memory).where(eq(memory.id, found.id));
}

/** Deletes memories that have been in the trash longer than the retention period. */
export async function purgeTrashedMemories(now: Date, retentionDays: number): Promise<number> {
	const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
	const deleted = await getDb()
		.delete(memory)
		.where(and(isNotNull(memory.deletedAt), lt(memory.deletedAt, cutoff)))
		.returning({ id: memory.id });
	return deleted.length;
}

/**
 * The search's rule for a memory, as for notes: a word of the text or title starts with each query
 * word, or the title contains the query or looks like it.
 */
function textMatch(query: string | undefined): SQL | undefined {
	const trimmed = query?.trim() ?? '';
	if (trimmed.length === 0) {
		return undefined;
	}
	const words = prefixQuery(trimmed);
	let fullText = sql`false`;
	if (words !== null) {
		fullText = sql`${memory.searchVector} @@ to_tsquery('simple', ${words})`;
	}
	return or(
		fullText,
		ilike(memory.title, containsPattern(trimmed)),
		sql`${memory.title} % ${trimmed}`,
		sql`${trimmed} <% ${memory.title}`
	);
}

export interface MemoryFilter {
	query?: string;
	/** Only memories in these categories; an empty list finds none. */
	categoryIds?: string[];
	/** Only memories without a category. */
	uncategorized?: boolean;
	/** Only memories with every one of these tags. */
	tagIds?: string[];
	pinned?: boolean;
	trashed?: boolean;
}

function filterConditions(filter: MemoryFilter, access: MemoryAccess): (SQL | undefined)[] {
	const conditions: (SQL | undefined)[] = [accessCondition(access)];
	if (filter.trashed === true) {
		conditions.push(isNotNull(memory.deletedAt));
	} else {
		conditions.push(isNull(memory.deletedAt));
	}
	conditions.push(textMatch(filter.query));
	if (filter.categoryIds !== undefined) {
		if (filter.categoryIds.length === 0) {
			conditions.push(sql`false`);
		} else {
			conditions.push(inArray(memory.categoryId, filter.categoryIds));
		}
	}
	if (filter.uncategorized === true) {
		conditions.push(isNull(memory.categoryId));
	}
	for (const tagId of new Set(filter.tagIds ?? [])) {
		conditions.push(
			sql`exists (select 1 from ${memoryTag} where ${memoryTag.memoryId} = ${memory.id} and ${memoryTag.tagId} = ${tagId})`
		);
	}
	if (filter.pinned !== undefined) {
		conditions.push(eq(memory.pinned, filter.pinned));
	}
	return conditions;
}

const summaryColumns = {
	id: memory.id,
	title: memory.title,
	// Enough text for the excerpt without reading whole documents.
	contentText: sql<string>`left(${memory.contentText}, ${EXCERPT_LENGTH * 4})`,
	categoryId: memory.categoryId,
	pinned: memory.pinned,
	version: memory.version,
	updatedAt: memory.updatedAt,
	deletedAt: memory.deletedAt
};

type SummaryRow = {
	id: string;
	title: string;
	contentText: string;
	categoryId: string | null;
	pinned: boolean;
	version: number;
	updatedAt: Date;
	deletedAt: Date | null;
};

async function toSummaries(rows: SummaryRow[]): Promise<MemorySummary[]> {
	const tags = await tagsOf(rows.map((row) => row.id));
	return rows.map((row) => ({
		id: row.id,
		title: row.title,
		excerpt: excerptOf(row.contentText),
		categoryId: row.categoryId,
		pinned: row.pinned,
		tags: tags.get(row.id) ?? [],
		version: row.version,
		updatedAt: row.updatedAt,
		deletedAt: row.deletedAt
	}));
}

/** Memories for the app's pages: pinned first, then by last update; the trash by deletion. */
export async function listMemories(
	filter: MemoryFilter = {},
	options: { limit?: number } = {},
	access: MemoryAccess = FULL_ACCESS
): Promise<MemorySummary[]> {
	let order = [desc(memory.pinned), desc(memory.updatedAt), desc(memory.id)];
	if (filter.trashed === true) {
		order = [desc(memory.deletedAt), desc(memory.id)];
	}
	const rows = await getDb()
		.select(summaryColumns)
		.from(memory)
		.where(and(...filterConditions(filter, access)))
		.orderBy(...order)
		.limit(options.limit ?? 1000);
	return toSummaries(rows);
}

/**
 * A page of memories by last update, for the API: one row more than `limit`, so the caller can
 * tell whether another page follows.
 */
export async function listMemoryPage(
	filter: MemoryFilter,
	page: { limit: number; after?: { updatedAt: Date; id: string } },
	access: MemoryAccess = FULL_ACCESS
): Promise<MemorySummary[]> {
	const conditions = filterConditions(filter, access);
	if (page.after !== undefined) {
		conditions.push(
			sql`(${memory.updatedAt}, ${memory.id}) < (${page.after.updatedAt.toISOString()}::timestamptz, ${page.after.id}::uuid)`
		);
	}
	const rows = await getDb()
		.select(summaryColumns)
		.from(memory)
		.where(and(...conditions))
		.orderBy(desc(memory.updatedAt), desc(memory.id))
		.limit(page.limit + 1);
	return toSummaries(rows);
}

export interface MemorySearchHit {
	id: string;
	title: string;
	snippet: string;
	/** From 0 to 1. */
	score: number;
}

/** Memories outside the trash that match the search rule, best first, each with a snippet. */
export async function searchMemories(
	query: string,
	limit: number,
	access: MemoryAccess = FULL_ACCESS
): Promise<MemorySearchHit[]> {
	const trimmed = query.trim();
	const match = textMatch(trimmed);
	if (match === undefined) {
		return [];
	}
	const words = prefixQuery(trimmed);
	let tsquery = sql`''::tsquery`;
	if (words !== null) {
		tsquery = sql`to_tsquery('simple', ${words})`;
	}
	const score = sql<number>`greatest(
		ts_rank_cd(${memory.searchVector}, ${tsquery}, 32),
		similarity(${memory.title}, ${trimmed}),
		word_similarity(${trimmed}, ${memory.title}),
		case when ${memory.title} ilike ${containsPattern(trimmed)} then 0.9 else 0 end
	)::float8`;
	const rows = await getDb()
		.select({
			id: memory.id,
			title: memory.title,
			snippet: sql<string>`ts_headline('simple', left(${memory.contentText}, 20000), ${tsquery}, 'StartSel="", StopSel="", MaxWords=24, MinWords=8, MaxFragments=1, FragmentDelimiter=" "')`,
			score
		})
		.from(memory)
		.where(and(isNull(memory.deletedAt), accessCondition(access), match))
		.orderBy(desc(score), desc(memory.updatedAt))
		.limit(limit);
	return rows.map((row) => ({
		id: row.id,
		title: row.title,
		snippet: excerptOf(row.snippet),
		score: Number(row.score)
	}));
}

/** The pinned memories within reach, whole, most recently updated first. */
export async function pinnedMemories(access: MemoryAccess = FULL_ACCESS): Promise<MemoryDetail[]> {
	const rows = await getDb()
		.select({ id: memory.id })
		.from(memory)
		.where(and(eq(memory.pinned, true), isNull(memory.deletedAt), accessCondition(access)))
		.orderBy(desc(memory.updatedAt), desc(memory.id))
		.limit(PINNED_CONTEXT_LIMIT);
	return Promise.all(rows.map((row) => findMemory(row.id, false, access)));
}

/** A memory's revisions, newest first, with the name of the key behind each while it exists. */
export async function listMemoryRevisions(
	memoryId: string,
	access: MemoryAccess = FULL_ACCESS
): Promise<MemoryRevisionSummary[]> {
	const found = await findMemory(memoryId, true, access);
	const rows = await getDb()
		.select({
			version: memoryRevision.version,
			title: memoryRevision.title,
			actorType: memoryRevision.actorType,
			actorId: memoryRevision.actorId,
			actorName: apiKey.name,
			createdAt: memoryRevision.createdAt,
			updatedAt: memoryRevision.updatedAt
		})
		.from(memoryRevision)
		.leftJoin(
			apiKey,
			and(
				eq(memoryRevision.actorType, 'api_key'),
				sql`${apiKey.id}::text = ${memoryRevision.actorId}`
			)
		)
		.where(eq(memoryRevision.memoryId, found.id))
		.orderBy(desc(memoryRevision.version));
	return rows;
}

export async function getMemoryRevision(
	memoryId: string,
	version: number,
	access: MemoryAccess = FULL_ACCESS
) {
	const found = await findMemory(memoryId, true, access);
	const [row] = await getDb()
		.select()
		.from(memoryRevision)
		.where(and(eq(memoryRevision.memoryId, found.id), eq(memoryRevision.version, version)))
		.limit(1);
	if (row === undefined) {
		throw new NotFoundError('Revision');
	}
	return row;
}

/** Writes a revision's title and content as a new version on top of the current one. */
export async function restoreMemoryRevision(
	memoryId: string,
	version: number,
	actor: Actor,
	access: MemoryAccess = FULL_ACCESS
): Promise<MemoryDetail> {
	const revision = await getMemoryRevision(memoryId, version, access);
	const current = await findMemory(memoryId, false, access);
	return updateMemory(
		memoryId,
		{ title: revision.title, content: revision.content, baseVersion: current.version },
		actor,
		access,
		{ forceRevision: true }
	);
}

export async function countMemories(): Promise<{ total: number; pinned: number }> {
	const [row] = await getDb()
		.select({
			total: count(),
			pinned: sql<number>`count(*) filter (where ${memory.pinned})::int`
		})
		.from(memory)
		.where(isNull(memory.deletedAt));
	return { total: row.total, pinned: row.pinned };
}
