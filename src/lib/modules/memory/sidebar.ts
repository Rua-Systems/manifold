import type { SidebarItem } from '../types';
import type { MemoryCategory } from './types';

// The memories in the sidebar: the categories by name, each with its subcategories and its newest
// memories, then the memories without a category. A category with more memories than it lists
// ends with a link to its page.

export interface SidebarMemory {
	id: string;
	title: string;
	categoryId: string | null;
}

export interface MemoryTreeLabels {
	/** The last item of a category that holds more memories than the sidebar lists. */
	more: (category: string) => string;
}

/**
 * Builds the tree. `memories` come in the order to list them and may be only some of all;
 * `counts` holds how many memories each category has in all. A memory whose category is unknown
 * sits with those without one.
 */
export function memoryTree(
	categories: MemoryCategory[],
	memories: SidebarMemory[],
	counts: Record<string, number>,
	limits: { topLevel: number; perCategory: number },
	labels: MemoryTreeLabels
): SidebarItem[] {
	const known = new Set(categories.map((category) => category.id));
	const memoriesIn: Record<string, SidebarMemory[]> = {};
	for (const item of memories) {
		let place = item.categoryId ?? '';
		if (!known.has(place)) {
			place = '';
		}
		memoriesIn[place] = [...(memoriesIn[place] ?? []), item];
	}

	function memoryItems(place: string, limit: number): SidebarItem[] {
		return (memoriesIn[place] ?? []).slice(0, limit).map((item) => ({
			id: item.id,
			label: item.title,
			link: { kind: 'internal', path: `/memory/${item.id}` },
			filterable: true
		}));
	}

	function categoryItem(category: MemoryCategory, children: SidebarItem[]): SidebarItem {
		const items = [...children, ...memoryItems(category.id, limits.perCategory)];
		const listed = Math.min((memoriesIn[category.id] ?? []).length, limits.perCategory);
		if ((counts[category.id] ?? 0) > listed) {
			items.push({
				id: `more:${category.id}`,
				label: labels.more(category.name),
				link: { kind: 'internal', path: `/memory?category=${category.id}` }
			});
		}
		return {
			id: `category:${category.id}`,
			label: category.name,
			link: { kind: 'internal', path: `/memory?category=${category.id}` },
			filterable: true,
			children: items
		};
	}

	const tree = categories
		.filter((category) => category.parentId === null)
		.map((category) =>
			categoryItem(
				category,
				categories
					.filter((child) => child.parentId === category.id)
					.map((child) => categoryItem(child, []))
			)
		);
	return [...tree, ...memoryItems('', limits.topLevel)];
}
