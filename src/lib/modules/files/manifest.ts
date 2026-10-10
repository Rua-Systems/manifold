import { m } from '$lib/paraglide/messages.js';
import type { ModuleManifest } from '../types';
import FilesIcon from './components/FilesIcon.svelte';

export const filesManifest: ModuleManifest = {
	id: 'files',
	label: m.files_title,
	icon: FilesIcon,
	href: '/files',
	position: 25,
	sidebar: 'link',
	// The scopes existed before the module, for uploads through the API; their ids stay.
	scopes: [
		{ id: 'files:read', access: 'read', label: m.scope_files_read },
		{ id: 'files:write', access: 'write', label: m.scope_files_write }
	]
};
