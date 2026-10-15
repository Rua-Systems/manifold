import { m } from '$lib/paraglide/messages.js';
import { getEnv } from '$lib/server/env';
import type { ServerModuleManifest } from '../types.server';
import { notesApiRoutes } from './api.server';
import { mapApiRoutes } from './map/api.server';
import { basemapApiRoutes } from './map/basemaps.api.server';
import { mapMcpTools } from './map/mcp.server';
import { notesMcpTools } from './mcp.server';
import {
	listNotes,
	noteFileUses,
	NOTES_MODULE,
	purgeTrashedNotes,
	searchNotes
} from './notes.server';
import { notesDashboard } from './dashboard.server';
import { allNoteFolders, noteCountsByFolder } from './folders.server';
import { noteTree } from './sidebar';
import { noteTokenCredentials } from './tokens.server';
import { notesUsage } from './usage.server';

/** Notes read for the sidebar's tree, newest first; the filter searches beyond them. */
const SIDEBAR_NOTE_LIMIT = 500;
const SIDEBAR_TOP_LEVEL_NOTES = 100;
const SIDEBAR_FOLDER_NOTES = 25;

export const notesServerManifest: ServerModuleManifest = {
	id: NOTES_MODULE,
	sidebarGroup: async () => {
		const [folders, notes, counts] = await Promise.all([
			allNoteFolders(),
			listNotes({ limit: SIDEBAR_NOTE_LIMIT }),
			noteCountsByFolder()
		]);
		const noteItems = noteTree(
			folders,
			notes,
			counts,
			{ topLevel: SIDEBAR_TOP_LEVEL_NOTES, perFolder: SIDEBAR_FOLDER_NOTES },
			{ untitled: m.notes_untitled(), more: (folder) => m.notes_sidebar_more({ folder }) }
		);

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
	fileUses: noteFileUses,
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
	],
	usage: notesUsage,
	credentials: noteTokenCredentials,
	dashboard: () => notesDashboard()
};
