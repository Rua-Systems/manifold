import { m } from '$lib/paraglide/messages.js';
import type { ModuleManifest } from '../types';
import DataSourcesIcon from './components/DataSourcesIcon.svelte';

export const dataSourcesManifest: ModuleManifest = {
	id: 'datasources',
	label: m.datasources_title,
	icon: DataSourcesIcon,
	href: '/data-sources',
	position: 28,
	sidebar: 'link',
	commands: [{ id: 'datasources.new', label: m.datasources_new, href: '/data-sources/new' }],
	// Passwords and tokens need a scope of their own: a key that reads where things are does not
	// also get the keys to them.
	scopes: [
		{ id: 'datasources:read', access: 'read', label: m.scope_datasources_read },
		{ id: 'datasources:secrets', access: 'read', label: m.scope_datasources_secrets },
		{ id: 'datasources:write', access: 'write', label: m.scope_datasources_write }
	]
};
