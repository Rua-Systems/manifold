import { m } from '$lib/paraglide/messages.js';
import type { ApiKeyIdentity } from '$lib/server/api-keys';
import { getDb, type Transaction } from '$lib/server/db';
import { ValidationError } from '$lib/server/errors';
import { isUuid } from '$lib/utils/uuid';
import { eq, inArray, sql, type SQL } from 'drizzle-orm';
import { categoryLabel, withSubcategories } from './categories';
import { allMemoryCategories } from './categories.server';
import { memory, memoryCategory, memoryKeyCategory } from './schema.server';

// Which memories a caller reaches. The owner and an API key without limits reach all of them; a
// key limited to some categories reaches only the memories in those and in their subcategories,
// never the ones without a category. A memory outside the reach answers as if it did not exist.

export interface MemoryAccess {
	/** Every memory, with or without a category. */
	all: boolean;
	/** The categories reached when `all` is false, subcategories included. */
	categoryIds: string[];
}

export const FULL_ACCESS: MemoryAccess = { all: true, categoryIds: [] };

/** The categories a key is limited to, as chosen: without the subcategories they take along. */
export async function keyCategoryIds(keyId: string): Promise<string[]> {
	if (!isUuid(keyId)) {
		return [];
	}
	const rows = await getDb()
		.select({ id: memoryKeyCategory.categoryId })
		.from(memoryKeyCategory)
		.where(eq(memoryKeyCategory.apiKeyId, keyId));
	return rows.map((row) => row.id);
}

/** What an API key reaches; note tokens never get the memory scopes, so they need no case. */
export async function memoryAccessFor(key: ApiKeyIdentity): Promise<MemoryAccess> {
	const chosen = await keyCategoryIds(key.id);
	if (chosen.length === 0) {
		return FULL_ACCESS;
	}
	const categories = await allMemoryCategories();
	const reached = new Set(chosen.flatMap((id) => withSubcategories(categories, id)));
	return { all: false, categoryIds: [...reached] };
}

/** The condition on `memory` rows for this reach; undefined when it reaches every memory. */
export function accessCondition(access: MemoryAccess): SQL | undefined {
	if (access.all) {
		return undefined;
	}
	if (access.categoryIds.length === 0) {
		return sql`false`;
	}
	return inArray(memory.categoryId, access.categoryIds);
}

/** Whether a memory in this category, null for none, is within reach. */
export function reaches(access: MemoryAccess, categoryId: string | null): boolean {
	if (access.all) {
		return true;
	}
	return categoryId !== null && access.categoryIds.includes(categoryId);
}

/**
 * Limits a new key to these categories inside the caller's transaction; none leaves it without
 * limits. Every id must name a category.
 */
export async function limitKeyToCategories(
	tx: Transaction,
	keyId: string,
	categoryIds: readonly string[]
): Promise<void> {
	const unique = [...new Set(categoryIds)];
	if (unique.length === 0) {
		return;
	}
	const valid = unique.filter((id) => isUuid(id));
	let found: { id: string }[] = [];
	if (valid.length > 0) {
		found = await tx
			.select({ id: memoryCategory.id })
			.from(memoryCategory)
			.where(inArray(memoryCategory.id, valid))
			// Keeps the categories from being deleted until the key's rows are in.
			.for('share');
	}
	if (found.length !== unique.length) {
		throw new ValidationError({ memoryCategories: m.memory_categories_error_missing() });
	}
	await tx
		.insert(memoryKeyCategory)
		.values(unique.map((categoryId) => ({ apiKeyId: keyId, categoryId })));
}

/** What each limited key is limited to, by key id, as category labels, for Settings → API Keys. */
export async function keyCategoryLabels(): Promise<Record<string, string[]>> {
	const [rows, categories] = await Promise.all([
		getDb()
			.select({ keyId: memoryKeyCategory.apiKeyId, categoryId: memoryKeyCategory.categoryId })
			.from(memoryKeyCategory),
		allMemoryCategories()
	]);
	const labels: Record<string, string[]> = {};
	for (const row of rows) {
		labels[row.keyId] = [
			...(labels[row.keyId] ?? []),
			categoryLabel(categories, row.categoryId)
		];
	}
	for (const list of Object.values(labels)) {
		list.sort((first, second) => first.localeCompare(second));
	}
	return labels;
}
