import type { FolderOption } from '$lib/types/folders';
import type { SidebarItem } from '../types';

// The notes in the sidebar as a tree: the folders by name, each with its folders and its newest
// notes, then the newest notes at the top level. A place with more notes than it lists ends with a
// link to the folder's page.

export interface SidebarNote {
	id: string;
	title: string;
	folderId: string | null;
}

export interface NoteTreeLimits {
	/** Notes listed at the top level; the group's "Show all" leads to the rest. */
	topLevel: number;
	/** Notes listed in each folder before a link to the folder's page. */
	perFolder: number;
}

export interface NoteTreeLabels {
	untitled: string;
	/** The last item of a folder that holds more notes than the sidebar lists. */
	more: (folder: string) => string;
}

/**
 * Builds the tree. `notes` come newest first and may be only the newest of all; `counts` holds how
 * many notes each folder has in all, so a folder whose notes were not all read still links to its
 * page. A note whose folder is unknown, such as one moved while the list was read, sits at the top
 * level.
 */
export function noteTree(
	folders: FolderOption[],
	notes: SidebarNote[],
	counts: Record<string, number>,
	limits: NoteTreeLimits,
	labels: NoteTreeLabels
): SidebarItem[] {
	const known = new Set(folders.map((folder) => folder.id));
	const foldersIn: Record<string, FolderOption[]> = {};
	for (const folder of folders) {
		let parent = folder.parentId ?? '';
		if (!known.has(parent)) {
			parent = '';
		}
		foldersIn[parent] = [...(foldersIn[parent] ?? []), folder];
	}
	const notesIn: Record<string, SidebarNote[]> = {};
	for (const item of notes) {
		let place = item.folderId ?? '';
		if (!known.has(place)) {
			place = '';
		}
		notesIn[place] = [...(notesIn[place] ?? []), item];
	}

	// A folder never lists itself, so a cycle in the data cannot recurse forever.
	function place(id: string, seen: Set<string>): SidebarItem[] {
		const items: SidebarItem[] = [];
		for (const folder of foldersIn[id] ?? []) {
			if (seen.has(folder.id)) {
				continue;
			}
			items.push({
				id: `folder:${folder.id}`,
				label: folder.name,
				link: { kind: 'internal', path: `/notes?folder=${folder.id}` },
				filterable: true,
				children: place(folder.id, new Set([...seen, folder.id]))
			});
		}
		const placed = notesIn[id] ?? [];
		let limit = limits.perFolder;
		if (id === '') {
			limit = limits.topLevel;
		}
		for (const item of placed.slice(0, limit)) {
			items.push({
				id: item.id,
				label: item.title || labels.untitled,
				link: { kind: 'internal', path: `/notes/${item.id}` },
				filterable: true
			});
		}
		const listed = Math.min(placed.length, limit);
		if (id !== '' && (counts[id] ?? placed.length) > listed) {
			const folder = folders.find((candidate) => candidate.id === id);
			items.push({
				id: `more:${id}`,
				label: labels.more(folder?.name ?? ''),
				link: { kind: 'internal', path: `/notes?folder=${id}` }
			});
		}
		return items;
	}

	return place('', new Set());
}
