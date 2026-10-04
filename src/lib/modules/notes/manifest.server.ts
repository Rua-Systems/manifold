import { m } from '$lib/paraglide/messages.js';
import { getEnv } from '$lib/server/env';
import type { SidebarItem } from '../types';
import type { ServerModuleManifest } from '../types.server';
import { notesApiRoutes } from './api.server';
import { mapApiRoutes } from './map/api.server';
import { basemapApiRoutes } from './map/basemaps.api.server';
import { mapMcpTools } from './map/mcp.server';
import { notesMcpTools } from './mcp.server';
import { listNotes, NOTES_MODULE, purgeTrashedNotes, searchNotes } from './notes.server';

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
			filterSearch: 'note',
			items: [
				{ id: 'map', label: m.map_title(), link: { kind: 'internal', path: '/notes/map' } },
				{ id: 'new', label: m.notes_new(), link: { kind: 'internal', path: '/notes/new' } },
				...noteItems,
				{ id: 'all', label: m.notes_show_all(), link: { kind: 'internal', path: '/notes' } }
			]
		};
	},
	fileReferences: [{ table: 'note_file', column: 'file_id' }],
	api: [...notesApiRoutes, ...mapApiRoutes, ...basemapApiRoutes],
	mcp: [...notesMcpTools, ...mapMcpTools],
	search: {
		type: 'note',
		scope: 'notes:read',
		search: async (query, limit) =>
			(await searchNotes(query, limit)).map((hit) => ({
				type: 'note',
				id: hit.id,
				title: hit.title || m.notes_untitled(),
				snippet: hit.snippet,
				href: `/notes/${hit.id}`,
				external: false,
				score: hit.score
			}))
	},
	housekeeping: [
		{
			name: 'notes.purge-trash',
			run: async (now) => {
				await purgeTrashedNotes(now, getEnv().TRASH_RETENTION_DAYS);
			}
		}
	]
};
