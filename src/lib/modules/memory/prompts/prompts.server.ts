import { m } from '$lib/paraglide/messages.js';
import { getDb, type Transaction } from '$lib/server/db';
import { hasErrorCode, UNIQUE_VIOLATION } from '$lib/server/db/errors';
import { tag } from '$lib/server/db/schema';
import { ConflictError, NotFoundError, ValidationError } from '$lib/server/errors';
import { containsPattern } from '$lib/server/search-query';
import type { Tag } from '$lib/types/tags';
import { isUuid } from '$lib/utils/uuid';
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { accessConditionOn, FULL_ACCESS, type MemoryAccess } from '../access.server';
import { requireCategoryFor } from '../memories.server';
import { memoryPrompt, memoryPromptTag } from './schema.server';
import {
	promptBodySchema,
	promptDescriptionSchema,
	promptNameSchema,
	promptTitleSchema
} from './schemas';
import type { Prompt } from './types';
import type { z } from 'zod';
import { PROMPT_VARIABLES_MAX, promptVariables } from './variables';

// Prompts of AI Memory. They sit in the categories of memories, so a key limited to some
// categories reaches only the prompts in them, as it does memories.

export interface PromptInput {
	name: string;
	title: string;
	description?: string;
	body: string;
	categoryId?: string | null;
	/** Resolved by the caller from ids or names. */
	tags?: Tag[];
}

export interface PromptUpdate {
	/** The version a change is based on; a different stored version is a conflict. */
	baseVersion?: number;
	name?: string;
	title?: string;
	description?: string;
	body?: string;
	categoryId?: string | null;
	tags?: Tag[];
}

export interface PromptFilter {
	query?: string;
	/** Only prompts in these categories; an empty list finds none. */
	categoryIds?: string[];
	uncategorized?: boolean;
	/** Only prompts with every one of these tags. */
	tagIds?: string[];
}

function parseField<T>(schema: z.ZodType<T>, field: string, value: unknown): T {
	const parsed = schema.safeParse(value);
	if (!parsed.success) {
		throw new ValidationError({ [field]: parsed.error.issues[0]?.message ?? '' });
	}
	return parsed.data;
}

function parseBody(body: string): string {
	const parsed = parseField(promptBodySchema, 'body', body);
	if (promptVariables(parsed).length > PROMPT_VARIABLES_MAX) {
		throw new ValidationError({
			body: m.prompts_error_variables({ max: PROMPT_VARIABLES_MAX })
		});
	}
	return parsed;
}

function nameTaken(error: unknown): unknown {
	if (hasErrorCode(error, UNIQUE_VIOLATION)) {
		return new ValidationError({ name: m.prompts_error_name_taken() });
	}
	return error;
}

function notFound(): NotFoundError {
	return new NotFoundError('Prompt');
}

const condition = (access: MemoryAccess) => accessConditionOn(memoryPrompt.categoryId, access);

async function tagsOf(ids: string[]): Promise<Map<string, Tag[]>> {
	const tags = new Map<string, Tag[]>();
	if (ids.length === 0) {
		return tags;
	}
	const rows = await getDb()
		.select({
			promptId: memoryPromptTag.promptId,
			id: tag.id,
			name: tag.name,
			color: tag.color
		})
		.from(memoryPromptTag)
		.innerJoin(tag, eq(tag.id, memoryPromptTag.tagId))
		.where(inArray(memoryPromptTag.promptId, ids))
		.orderBy(asc(sql`lower(${tag.name})`));
	for (const row of rows) {
		tags.set(row.promptId, [
			...(tags.get(row.promptId) ?? []),
			{ id: row.id, name: row.name, color: row.color }
		]);
	}
	return tags;
}

type PromptRow = typeof memoryPrompt.$inferSelect;

async function toPrompts(rows: PromptRow[]): Promise<Prompt[]> {
	const tags = await tagsOf(rows.map((row) => row.id));
	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		title: row.title,
		description: row.description,
		body: row.body,
		variables: promptVariables(row.body),
		categoryId: row.categoryId,
		tags: tags.get(row.id) ?? [],
		version: row.version,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt
	}));
}

async function setTags(tx: Transaction, promptId: string, tags: Tag[]): Promise<void> {
	await tx.delete(memoryPromptTag).where(eq(memoryPromptTag.promptId, promptId));
	const ids = [...new Set(tags.map((item) => item.id))];
	if (ids.length > 0) {
		await tx.insert(memoryPromptTag).values(ids.map((tagId) => ({ promptId, tagId })));
	}
}

export async function getPrompt(id: string, access: MemoryAccess = FULL_ACCESS): Promise<Prompt> {
	if (!isUuid(id)) {
		throw notFound();
	}
	const rows = await getDb()
		.select()
		.from(memoryPrompt)
		.where(and(eq(memoryPrompt.id, id), condition(access)))
		.limit(1);
	const [found] = await toPrompts(rows);
	if (found === undefined) {
		throw notFound();
	}
	return found;
}

/** A prompt by its handle, such as `code-review`, as the MCP server names it. */
export async function getPromptByName(
	name: string,
	access: MemoryAccess = FULL_ACCESS
): Promise<Prompt> {
	const rows = await getDb()
		.select()
		.from(memoryPrompt)
		.where(and(eq(memoryPrompt.name, name.trim().toLowerCase()), condition(access)))
		.limit(1);
	const [found] = await toPrompts(rows);
	if (found === undefined) {
		throw notFound();
	}
	return found;
}

function textMatch(query: string | undefined): SQL | undefined {
	const trimmed = query?.trim() ?? '';
	if (trimmed.length === 0) {
		return undefined;
	}
	const pattern = containsPattern(trimmed);
	return or(
		ilike(memoryPrompt.title, pattern),
		ilike(memoryPrompt.name, pattern),
		ilike(memoryPrompt.description, pattern),
		ilike(memoryPrompt.body, pattern),
		sql`${trimmed} <% ${memoryPrompt.title}`
	);
}

/** Prompts by title, filtered by words, categories and tags. */
export async function listPrompts(
	filter: PromptFilter = {},
	access: MemoryAccess = FULL_ACCESS
): Promise<Prompt[]> {
	const conditions: (SQL | undefined)[] = [condition(access), textMatch(filter.query)];
	if (filter.categoryIds !== undefined) {
		if (filter.categoryIds.length === 0) {
			conditions.push(sql`false`);
		} else {
			conditions.push(inArray(memoryPrompt.categoryId, filter.categoryIds));
		}
	}
	if (filter.uncategorized === true) {
		conditions.push(isNull(memoryPrompt.categoryId));
	}
	for (const tagId of new Set(filter.tagIds ?? [])) {
		conditions.push(
			sql`exists (select 1 from ${memoryPromptTag} where ${memoryPromptTag.promptId} = ${memoryPrompt.id} and ${memoryPromptTag.tagId} = ${tagId})`
		);
	}
	const rows = await getDb()
		.select()
		.from(memoryPrompt)
		.where(and(...conditions))
		.orderBy(asc(sql`lower(${memoryPrompt.title})`), asc(memoryPrompt.id))
		.limit(1000);
	return toPrompts(rows);
}

export interface PromptSearchHit {
	id: string;
	title: string;
	snippet: string;
	score: number;
}

/** Prompts whose title, handle or text contains the query, or whose title looks like it. */
export async function searchPrompts(
	query: string,
	limit: number,
	access: MemoryAccess = FULL_ACCESS
): Promise<PromptSearchHit[]> {
	const trimmed = query.trim();
	const match = textMatch(trimmed);
	if (match === undefined) {
		return [];
	}
	const score = sql<number>`greatest(
		word_similarity(${trimmed}, ${memoryPrompt.title}),
		case when ${memoryPrompt.title} ilike ${containsPattern(trimmed)} then 0.9 else 0 end,
		case when ${memoryPrompt.body} ilike ${containsPattern(trimmed)} then 0.5 else 0 end
	)::float8`;
	const rows = await getDb()
		.select({
			id: memoryPrompt.id,
			title: memoryPrompt.title,
			description: memoryPrompt.description,
			name: memoryPrompt.name,
			score
		})
		.from(memoryPrompt)
		.where(and(condition(access), match))
		.orderBy(desc(score), asc(memoryPrompt.title))
		.limit(limit);
	return rows.map((row) => ({
		id: row.id,
		title: row.title,
		snippet: row.description || row.name,
		score: Number(row.score)
	}));
}

export async function createPrompt(
	input: PromptInput,
	access: MemoryAccess = FULL_ACCESS,
	now = new Date()
): Promise<Prompt> {
	const values = {
		name: parseField(promptNameSchema, 'name', input.name),
		title: parseField(promptTitleSchema, 'title', input.title),
		description: parseField(promptDescriptionSchema, 'description', input.description ?? ''),
		body: parseBody(input.body),
		categoryId: await requireCategoryFor(input.categoryId ?? null, access)
	};
	let id: string;
	try {
		id = await getDb().transaction(async (tx) => {
			const [created] = await tx
				.insert(memoryPrompt)
				.values({ ...values, createdAt: now, updatedAt: now })
				.returning({ id: memoryPrompt.id });
			await setTags(tx, created.id, input.tags ?? []);
			return created.id;
		});
	} catch (error) {
		throw nameTaken(error);
	}
	return getPrompt(id, access);
}

/** Changes a prompt; every change makes a new version, based on `baseVersion` when it is sent. */
export async function updatePrompt(
	id: string,
	update: PromptUpdate,
	access: MemoryAccess = FULL_ACCESS,
	now = new Date()
): Promise<Prompt> {
	if (!isUuid(id)) {
		throw notFound();
	}
	const changes: Partial<typeof memoryPrompt.$inferInsert> = {};
	if (update.name !== undefined) {
		changes.name = parseField(promptNameSchema, 'name', update.name);
	}
	if (update.title !== undefined) {
		changes.title = parseField(promptTitleSchema, 'title', update.title);
	}
	if (update.description !== undefined) {
		changes.description = parseField(
			promptDescriptionSchema,
			'description',
			update.description
		);
	}
	if (update.body !== undefined) {
		changes.body = parseBody(update.body);
	}
	if (update.categoryId !== undefined) {
		changes.categoryId = await requireCategoryFor(update.categoryId, access);
	}

	try {
		await getDb().transaction(async (tx) => {
			const [current] = await tx
				.select({ version: memoryPrompt.version })
				.from(memoryPrompt)
				.where(and(eq(memoryPrompt.id, id), condition(access)))
				.for('update');
			if (current === undefined) {
				throw notFound();
			}
			if (update.baseVersion !== undefined && current.version !== update.baseVersion) {
				throw new ConflictError(current.version);
			}
			await tx
				.update(memoryPrompt)
				.set({ ...changes, version: current.version + 1, updatedAt: now })
				.where(eq(memoryPrompt.id, id));
			if (update.tags !== undefined) {
				await setTags(tx, id, update.tags);
			}
		});
	} catch (error) {
		throw nameTaken(error);
	}
	return getPrompt(id, access);
}

export async function deletePrompt(id: string, access: MemoryAccess = FULL_ACCESS): Promise<void> {
	const found = await getPrompt(id, access);
	await getDb().delete(memoryPrompt).where(eq(memoryPrompt.id, found.id));
}

export async function countPrompts(): Promise<number> {
	const [row] = await getDb().select({ total: count() }).from(memoryPrompt);
	return row.total;
}
