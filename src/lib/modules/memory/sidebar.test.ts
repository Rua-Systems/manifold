import { describe, expect, it } from 'vitest';
import { memoryTree } from './sidebar';

const WORK = { id: 'work', name: 'Work', parentId: null };
const ATLAS = { id: 'atlas', name: 'Atlas', parentId: 'work' };
const HOME = { id: 'home', name: 'Home', parentId: null };

const labels = { more: (category: string) => `All of ${category}` };

describe('memoryTree', () => {
	it('nests subcategories and memories under their categories, then the rest', () => {
		const tree = memoryTree(
			[ATLAS, HOME, WORK],
			[
				{ id: 'm1', title: 'Deploys', categoryId: 'atlas' },
				{ id: 'm2', title: 'Style', categoryId: 'work' },
				{ id: 'm3', title: 'Loose', categoryId: null },
				{ id: 'm4', title: 'Lost', categoryId: 'gone' }
			],
			{ atlas: 1, work: 1 },
			{ topLevel: 10, perCategory: 10 },
			labels
		);

		expect(tree.map((item) => item.label)).toEqual(['Home', 'Work', 'Loose', 'Lost']);
		const work = tree[1];
		expect(work.link).toEqual({ kind: 'internal', path: '/memory?category=work' });
		expect(work.children?.map((item) => item.label)).toEqual(['Atlas', 'Style']);
		expect(work.children?.[0].children?.map((item) => item.label)).toEqual(['Deploys']);
		expect(tree[0].children).toEqual([]);
		expect(tree[2].link).toEqual({ kind: 'internal', path: '/memory/m3' });
	});

	it('ends a category with a link to its page when it holds more than it lists', () => {
		const tree = memoryTree(
			[WORK],
			[
				{ id: 'm1', title: 'One', categoryId: 'work' },
				{ id: 'm2', title: 'Two', categoryId: 'work' }
			],
			{ work: 5 },
			{ topLevel: 10, perCategory: 1 },
			labels
		);

		expect(tree[0].children?.map((item) => item.label)).toEqual(['One', 'All of Work']);
		expect(tree[0].children?.[1].link).toEqual({
			kind: 'internal',
			path: '/memory?category=work'
		});
	});
});
