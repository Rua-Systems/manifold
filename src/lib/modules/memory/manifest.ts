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
		{ id: 'memory.categories', label: m.memory_categories_title, href: '/memory/categories' },
		{ id: 'memory.prompts', label: m.prompts_title, href: '/memory/prompts' },
		{ id: 'memory.prompts.new', label: m.prompts_new, href: '/memory/prompts/new' }
	],
	scopes: [
		{ id: 'memory:read', access: 'read', label: m.scope_memory_read },
		{ id: 'memory:write', access: 'write', label: m.scope_memory_write },
		{ id: 'prompts:read', access: 'read', label: m.scope_prompts_read },
		{ id: 'prompts:write', access: 'write', label: m.scope_prompts_write }
	]
};
