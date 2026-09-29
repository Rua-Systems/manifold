import { m } from '$lib/paraglide/messages.js';
import { getEnv } from '$lib/server/env';
import type { SidebarItem } from '../types';
import type { ServerModuleManifest } from '../types.server';
import { listNotes, NOTES_MODULE, purgeTrashedNotes } from './notes.server';

const SIDEBAR_NOTE_LIMIT = 100;

export const notesServerManifest: ServerModuleManifest = {
	id: NOTES_MODULE,
	sidebarGroup: async () => {
		const notes = await listNotes({ limit: SIDEBAR_NOTE_LIMIT });
		const noteItems: SidebarItem[] = notes.map((item) => ({
			id: item.id,
			label: item.title || m.notes_untitled(),
			link: { kind: 'internal', path: `/notes/${item.id}` },
			filterable: true
		}));

		return {
			filterLabel: m.notes_filter(),
			items: [
				{ id: 'map', label: m.map_title(), link: { kind: 'internal', path: '/notes/map' } },
				{ id: 'new', label: m.notes_new(), link: { kind: 'internal', path: '/notes/new' } },
				...noteItems,
				{ id: 'all', label: m.notes_show_all(), link: { kind: 'internal', path: '/notes' } }
			]
		};
	},
	fileReferences: [{ table: 'note_file', column: 'file_id' }],
	housekeeping: [
		{
			name: 'notes.purge-trash',
			run: async (now) => {
				await purgeTrashedNotes(now, getEnv().TRASH_RETENTION_DAYS);
			}
		}
	]
};
