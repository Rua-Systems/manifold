import { describe, expect, it } from 'vitest';
import type { SidebarItem } from '../types';
import { noteTree, type SidebarNote } from './sidebar';

const LABELS = { untitled: 'Untitled', more: (folder: string) => `More in ${folder}` };
const LIMITS = { topLevel: 3, perFolder: 2 };

const WORK = { id: 'f-work', name: 'Work', parentId: null };
const ATLAS = { id: 'f-atlas', name: 'Atlas', parentId: 'f-work' };
const HOME = { id: 'f-home', name: 'Home', parentId: null };

function note(id: string, folderId: string | null, title = id): SidebarNote {
	return { id, title, folderId };
}

function labels(items: SidebarItem[]): string[] {
	return items.map((item) => item.label);
}

describe('noteTree', () => {
	it('puts folders first, then the notes of each place, nested', () => {
		const tree = noteTree(
			[WORK, ATLAS, HOME],
			[note('n1', 'f-atlas'), note('n2', null), note('n3', 'f-work')],
			{},
			LIMITS,
			LABELS
		);
		expect(labels(tree)).toEqual(['Work', 'Home', 'n2']);
		const work = tree[0];
		expect(work.id).toBe('folder:f-work');
		expect(work.link).toEqual({ kind: 'internal', path: '/notes?folder=f-work' });
		expect(labels(work.children ?? [])).toEqual(['Atlas', 'n3']);
		expect(labels(work.children?.[0].children ?? [])).toEqual(['n1']);
		expect(tree[1].children).toEqual([]);
		expect(tree[2]).toEqual({
			id: 'n2',
			label: 'n2',
			link: { kind: 'internal', path: '/notes/n2' },
			filterable: true
		});
	});

	it('names untitled notes', () => {
		const tree = noteTree([], [note('n1', null, '')], {}, LIMITS, LABELS);
		expect(labels(tree)).toEqual(['Untitled']);
	});

	it('lists a few notes per folder and links to the folder for the rest', () => {
		const notes = [note('a', 'f-home'), note('b', 'f-home'), note('c', 'f-home')];
		const tree = noteTree([HOME], notes, { 'f-home': 3 }, LIMITS, LABELS);
		const children = tree[0].children ?? [];
		expect(labels(children)).toEqual(['a', 'b', 'More in Home']);
		expect(children[2]).toEqual({
			id: 'more:f-home',
			label: 'More in Home',
			link: { kind: 'internal', path: '/notes?folder=f-home' }
		});
	});

	it('links to a folder whose notes were not all read', () => {
		const tree = noteTree([HOME], [note('a', 'f-home')], { 'f-home': 40 }, LIMITS, LABELS);
		expect(labels(tree[0].children ?? [])).toEqual(['a', 'More in Home']);
	});

	it('keeps the top level to its own limit without a link', () => {
		const notes = ['a', 'b', 'c', 'd'].map((id) => note(id, null));
		expect(labels(noteTree([], notes, {}, LIMITS, LABELS))).toEqual(['a', 'b', 'c']);
	});

	it('puts notes and folders of unknown folders at the top level', () => {
		const orphan = { id: 'f-orphan', name: 'Orphan', parentId: 'f-gone' };
		const tree = noteTree([orphan], [note('n1', 'f-gone')], {}, LIMITS, LABELS);
		expect(labels(tree)).toEqual(['Orphan', 'n1']);
	});

	it('stops at a cycle in the folders', () => {
		const first = { id: 'f-1', name: 'One', parentId: 'f-2' };
		const second = { id: 'f-2', name: 'Two', parentId: 'f-1' };
		// Neither folder is at the top level, so the cycle is never reached from there.
		expect(noteTree([first, second], [], {}, LIMITS, LABELS)).toEqual([]);
	});
});
