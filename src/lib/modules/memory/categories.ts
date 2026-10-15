import type { MemoryCategory, MemoryCategoryNode } from './types';

// Category helpers that hold no data access, for the pages and the server alike.

/**
 * The categories as a tree, by name, each with its own count and its subcategories. A
 * subcategory whose parent is missing, which the database does not allow, would be left out.
 */
export function categoryTree(
	categories: MemoryCategory[],
	counts: Record<string, number>
): MemoryCategoryNode[] {
	return categories
		.filter((category) => category.parentId === null)
		.map((category) => ({
			...category,
			count: counts[category.id] ?? 0,
			children: categories
				.filter((child) => child.parentId === category.id)
				.map((child) => ({ ...child, count: counts[child.id] ?? 0 }))
		}));
}

/** The category and its subcategories, for filters that take a category as a whole. */
export function withSubcategories(categories: MemoryCategory[], id: string): string[] {
	return [
		id,
		...categories.filter((category) => category.parentId === id).map((category) => category.id)
	];
}

/** "Category / Subcategory" for a subcategory, the name for a category, '' for none. */
export function categoryLabel(categories: MemoryCategory[], id: string | null): string {
	const found = categories.find((category) => category.id === id);
	if (found === undefined) {
		return '';
	}
	const parent = categories.find((category) => category.id === found.parentId);
	if (parent === undefined) {
		return found.name;
	}
	return `${parent.name} / ${found.name}`;
}
