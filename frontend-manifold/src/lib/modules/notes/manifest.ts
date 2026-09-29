import { m } from '$lib/paraglide/messages.js';
import type { ModuleManifest } from '../types';
import NotesIcon from './components/NotesIcon.svelte';

export const notesManifest: ModuleManifest = {
	id: 'notes',
	label: m.notes_title,
	icon: NotesIcon,
	href: '/notes',
	position: 20,
	sidebar: 'group',
	scopes: [
		{ id: 'notes:read', access: 'read', label: m.scope_notes_read },
		{ id: 'notes:write', access: 'write', label: m.scope_notes_write },
		{ id: 'map:read', access: 'read', label: m.scope_map_read },
		{ id: 'map:write', access: 'write', label: m.scope_map_write }
	]
};
