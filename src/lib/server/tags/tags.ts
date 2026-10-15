import { m } from '$lib/paraglide/messages.js';
import { tagSchema, TAGS_PER_RECORD_MAX } from '$lib/schemas/tags';
import type { Tag } from '$lib/types/tags';
import { isUuid } from '$lib/utils/uuid';
import { fieldErrors } from '$lib/utils/validation';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '../db';
import { hasErrorCode, UNIQUE_VIOLATION } from '../db/errors';
import { tag } from '../db/schema';
import { NotFoundError, ValidationError } from '../errors';

// Global tags. Only the owner makes, renames and deletes them; modules and agents pick from them
// by id or by name.

const columns = { id: tag.id, name: tag.name, color: tag.color };

function parseInput(input: unknown) {
	const parsed = tagSchema.safeParse(input);
	if (!parsed.success) {
		throw new ValidationError(fieldErrors(parsed.error));
	}
	return parsed.data;
}

function nameTaken(error: unknown): unknown {
	if (hasErrorCode(error, UNIQUE_VIOLATION)) {
		return new ValidationError({ name: m.tags_error_name_taken() });
	}
	return error;
}

/** Every tag by name, whatever its case. */
export async function listTags(): Promise<Tag[]> {
	return getDb()
		.select(columns)
		.from(tag)
		.orderBy(sql`lower(${tag.name})`, asc(tag.id));
}

export async function getTag(id: string): Promise<Tag> {
	if (!isUuid(id)) {
		throw new NotFoundError('Tag');
	}
	const [row] = await getDb().select(columns).from(tag).where(eq(tag.id, id)).limit(1);
	if (row === undefined) {
		throw new NotFoundError('Tag');
	}
	return row;
}

export async function createTag(input: unknown): Promise<Tag> {
	const data = parseInput(input);
	try {
		const [created] = await getDb().insert(tag).values(data).returning(columns);
		return created;
	} catch (error) {
		throw nameTaken(error);
	}
}

export async function updateTag(id: string, input: unknown): Promise<Tag> {
	const data = parseInput(input);
	await getTag(id);
	try {
		const [updated] = await getDb()
			.update(tag)
			.set({ ...data, updatedAt: new Date() })
			.where(eq(tag.id, id))
			.returning(columns);
		return updated;
	} catch (error) {
		throw nameTaken(error);
	}
}

/** Deletes the tag; the records that carried it lose it. */
export async function deleteTag(id: string): Promise<void> {
	if (!isUuid(id)) {
		throw new NotFoundError('Tag');
	}
	const deleted = await getDb().delete(tag).where(eq(tag.id, id)).returning({ id: tag.id });
	if (deleted.length === 0) {
		throw new NotFoundError('Tag');
	}
}

function tooMany(): ValidationError {
	return new ValidationError({ tags: m.tags_error_too_many({ max: TAGS_PER_RECORD_MAX }) });
}

/**
 * The tags with these ids, once each, for a record that takes them from a form. An id that names
 * no tag is refused, since the form only offers existing ones.
 */
export async function tagsByIds(ids: readonly string[]): Promise<Tag[]> {
	const unique = [...new Set(ids)];
	if (unique.length === 0) {
		return [];
	}
	if (unique.length > TAGS_PER_RECORD_MAX) {
		throw tooMany();
	}
	const valid = unique.filter((id) => isUuid(id));
	let rows: Tag[] = [];
	if (valid.length > 0) {
		rows = await getDb().select(columns).from(tag).where(inArray(tag.id, valid));
	}
	if (rows.length !== unique.length) {
		throw new ValidationError({ tags: m.tags_error_missing() });
	}
	return rows;
}

/**
 * The tags with these names, whatever their case, once each, for writes through the API and MCP.
 * Unknown names are refused with the list of them: agents use the owner's tags and never make new
 * ones.
 */
export async function tagsByNames(names: readonly string[]): Promise<Tag[]> {
	const wanted = new Map<string, string>();
	for (const name of names) {
		const trimmed = name.trim();
		if (trimmed.length > 0) {
			wanted.set(trimmed.toLowerCase(), trimmed);
		}
	}
	if (wanted.size === 0) {
		return [];
	}
	if (wanted.size > TAGS_PER_RECORD_MAX) {
		throw tooMany();
	}
	const rows = await getDb()
		.select(columns)
		.from(tag)
		.where(inArray(sql`lower(${tag.name})`, [...wanted.keys()]));
	const found = new Set(rows.map((row) => row.name.toLowerCase()));
	const unknown = [...wanted.entries()]
		.filter(([key]) => !found.has(key))
		.map(([, name]) => name);
	if (unknown.length > 0) {
		throw new ValidationError({ tags: m.tags_error_unknown({ names: unknown.join(', ') }) });
	}
	return rows;
}
