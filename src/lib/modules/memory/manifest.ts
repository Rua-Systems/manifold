import { m } from '$lib/paraglide/messages.js';
import type { ModuleManifest } from '../types';
import MemoryIcon from './components/MemoryIcon.svelte';

export const memoryManifest: ModuleManifest = {
	id: 'memory',
	label: m.memory_module_title,
	icon: MemoryIcon,
	href: '/memory',
	position: 22,
	sidebar: 'group',
	commands: [
		{ id: 'memory.new', label: m.memory_new, href: '/memory/new' },
		{ id: 'memory.categories', label: m.memory_categories_title, href: '/memory/categories' }
	],
	scopes: [
		{ id: 'memory:read', access: 'read', label: m.scope_memory_read },
		{ id: 'memory:write', access: 'write', label: m.scope_memory_write }
	]
};
