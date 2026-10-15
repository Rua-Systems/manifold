import { m } from '$lib/paraglide/messages.js';
import { getDb } from '$lib/server/db';
import { FOREIGN_KEY_VIOLATION, hasErrorCode, UNIQUE_VIOLATION } from '$lib/server/db/errors';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { isUuid } from '$lib/utils/uuid';
import { and, asc, count, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { memoryCategoryNameSchema } from './schemas';
import { memory, memoryCategory, memoryKeyCategory } from './schema.server';
import type { MemoryCategory } from './types';

// Categories of memories: a category at the top, and subcategories inside it, never deeper. Only
// the owner makes, renames and deletes them; agents file memories in the existing ones.

const columns = {
	id: memoryCategory.id,
	name: memoryCategory.name,
	parentId: memoryCategory.parentId
};

function parseName(value: string): string {
	const parsed = memoryCategoryNameSchema.safeParse(value);
	if (!parsed.success) {
		throw new ValidationError({
			name: parsed.error.issues[0]?.message ?? m.validation_required()
		});
	}
	return parsed.data;
}

function nameTakenOr(error: unknown): unknown {
	if (hasErrorCode(error, UNIQUE_VIOLATION)) {
		return new ValidationError({ name: m.memory_categories_error_name_taken() });
	}
	return error;
}

/** A category by id, or null when there is none. */
export async function getMemoryCategory(id: string): Promise<MemoryCategory | null> {
	if (!isUuid(id)) {
		return null;
	}
	const [row] = await getDb()
		.select(columns)
		.from(memoryCategory)
		.where(eq(memoryCategory.id, id))
		.limit(1);
	return row ?? null;
}

async function requireCategory(id: string): Promise<MemoryCategory> {
	const found = await getMemoryCategory(id);
	if (found === null) {
		throw new NotFoundError('Category');
	}
	return found;
}

/** Every category and subcategory by name. */
export async function allMemoryCategories(): Promise<MemoryCategory[]> {
	return getDb()
		.select(columns)
		.from(memoryCategory)
		.orderBy(asc(sql`lower(${memoryCategory.name})`), asc(memoryCategory.id));
}

/** How many memories outside the trash each category holds directly, by category id. */
export async function memoryCountsByCategory(): Promise<Record<string, number>> {
	const rows = await getDb()
		.select({ id: memory.categoryId, total: count() })
		.from(memory)
		.where(and(isNotNull(memory.categoryId), isNull(memory.deletedAt)))
		.groupBy(memory.categoryId);
	const counts: Record<string, number> = {};
	for (const row of rows) {
		if (row.id !== null) {
			counts[row.id] = row.total;
		}
	}
	return counts;
}

export async function countMemoryCategories(): Promise<number> {
	const [row] = await getDb().select({ total: count() }).from(memoryCategory);
	return row.total;
}

/** Makes a category, or a subcategory inside a category; a subcategory holds no further ones. */
export async function createMemoryCategory(input: {
	name: string;
	parentId: string | null;
}): Promise<MemoryCategory> {
	const name = parseName(input.name);
	if (input.parentId !== null) {
		const parent = await getMemoryCategory(input.parentId);
		if (parent === null) {
			throw new ValidationError({ parent: m.memory_categories_error_missing() });
		}
		if (parent.parentId !== null) {
			throw new ValidationError({ parent: m.memory_categories_error_depth() });
		}
	}
	try {
		const [row] = await getDb()
			.insert(memoryCategory)
			.values({ name, parentId: input.parentId })
			.returning(columns);
		return row;
	} catch (error) {
		throw nameTakenOr(error);
	}
}

export async function renameMemoryCategory(id: string, name: string): Promise<MemoryCategory> {
	const cleaned = parseName(name);
	await requireCategory(id);
	try {
		const [row] = await getDb()
			.update(memoryCategory)
			.set({ name: cleaned, updatedAt: new Date() })
			.where(eq(memoryCategory.id, id))
			.returning(columns);
		return row;
	} catch (error) {
		throw nameTakenOr(error);
	}
}

/**
 * Deletes an empty category: one with subcategories or memories outside the trash is refused, and
 * so is one an API key is limited to, since deleting it would change what the key reaches.
 * Memories in the trash that were in it lose their category.
 */
export async function deleteMemoryCategory(id: string): Promise<void> {
	await requireCategory(id);
	try {
		await getDb().transaction(async (tx) => {
			// Filing a memory checks the key with a share lock on the category's row, so locking the
			// row first makes such a write wait, and the count below sees every memory that got in.
			await tx
				.select({ id: memoryCategory.id })
				.from(memoryCategory)
				.where(eq(memoryCategory.id, id))
				.for('update');
			const [[children], [live], [keys]] = await Promise.all([
				tx
					.select({ total: count() })
					.from(memoryCategory)
					.where(eq(memoryCategory.parentId, id)),
				tx
					.select({ total: count() })
					.from(memory)
					.where(and(eq(memory.categoryId, id), isNull(memory.deletedAt))),
				tx
					.select({ total: count() })
					.from(memoryKeyCategory)
					.where(eq(memoryKeyCategory.categoryId, id))
			]);
			if (children.total + live.total > 0) {
				throw new ValidationError({ category: m.memory_categories_error_not_empty() });
			}
			if (keys.total > 0) {
				throw new ValidationError({ category: m.memory_categories_error_key() });
			}
			await tx.delete(memoryCategory).where(eq(memoryCategory.id, id));
		});
	} catch (error) {
		// A subcategory was made, or a key limited to it, meanwhile.
		if (hasErrorCode(error, FOREIGN_KEY_VIOLATION)) {
			throw new ValidationError({ category: m.memory_categories_error_not_empty() });
		}
		throw error;
	}
}
