import { m } from '$lib/paraglide/messages.js';
import { getEnv } from '$lib/server/env';
import { measureRows } from '$lib/server/usage/measure';
import type { DashboardCard } from '$lib/types/dashboard';
import { isNotNull, isNull } from 'drizzle-orm';
import type { ServerModuleManifest } from '../types.server';
import { FULL_ACCESS, memoryAccessFor } from './access.server';
import { memoryApiRoutes } from './api.server';
import {
	allMemoryCategories,
	countMemoryCategories,
	memoryCountsByCategory
} from './categories.server';
import { memoryMcpTools } from './mcp.server';
import {
	countMemories,
	listMemories,
	MEMORY_MODULE,
	purgeTrashedMemories,
	searchMemories
} from './memories.server';
import { memory, memoryCategory, memoryRevision } from './schema.server';
import { promptApiRoutes } from './prompts/api.server';
import { promptMcpPrompts, promptMcpTools } from './prompts/mcp.server';
import { countPrompts, searchPrompts } from './prompts/prompts.server';
import { memoryPrompt } from './prompts/schema.server';
import { memoryTree } from './sidebar';

/** Memories read for the sidebar's tree, pinned and newest first; the filter searches beyond. */
const SIDEBAR_MEMORY_LIMIT = 500;
const SIDEBAR_TOP_LEVEL_MEMORIES = 50;
const SIDEBAR_CATEGORY_MEMORIES = 25;
const RECENT_MEMORIES = 6;

async function memoryDashboard(): Promise<DashboardCard[]> {
	const [counts, categories, prompts, recent] = await Promise.all([
		countMemories(),
		countMemoryCategories(),
		countPrompts(),
		listMemories({}, { limit: RECENT_MEMORIES })
	]);
	return [
		{
			id: 'memory',
			title: m.memory_module_title(),
			href: '/memory',
			blocks: [
				{
					kind: 'stats',
					stats: [
						{
							id: 'memories',
							label: m.dashboard_memories(),
							value: counts.total,
							unit: 'count'
						},
						{
							id: 'pinned',
							label: m.dashboard_memories_pinned(),
							value: counts.pinned,
							unit: 'count'
						},
						{
							id: 'categories',
							label: m.memory_categories_title(),
							value: categories,
							unit: 'count'
						},
						{
							id: 'prompts',
							label: m.dashboard_prompts(),
							value: prompts,
							unit: 'count'
						}
					]
				},
				{
					kind: 'links',
					id: 'recent',
					title: m.dashboard_memories_recent(),
					empty: m.dashboard_memories_empty(),
					links: recent.map((item) => ({
						id: item.id,
						label: item.title,
						href: `/memory/${item.id}`,
						external: false,
						time: item.updatedAt
					}))
				}
			]
		}
	];
}

export const memoryServerManifest: ServerModuleManifest = {
	id: MEMORY_MODULE,
	sidebarGroup: async () => {
		const [categories, memories, counts] = await Promise.all([
			allMemoryCategories(),
			listMemories({}, { limit: SIDEBAR_MEMORY_LIMIT }),
			memoryCountsByCategory()
		]);
		const memoryItems = memoryTree(
			categories,
			memories,
			counts,
			{ topLevel: SIDEBAR_TOP_LEVEL_MEMORIES, perCategory: SIDEBAR_CATEGORY_MEMORIES },
			{ more: (category) => m.memory_sidebar_more({ category }) }
		);
		return {
			filterLabel: m.memory_filter(),
			filterSearch: 'memory',
			items: [
				{
					id: 'new',
					label: m.memory_new(),
					link: { kind: 'internal', path: '/memory/new' }
				},
				{
					id: 'prompts',
					label: m.prompts_title(),
					link: { kind: 'internal', path: '/memory/prompts' }
				},
				...memoryItems,
				{
					id: 'all',
					label: m.memory_show_all(),
					link: { kind: 'internal', path: '/memory' }
				}
			]
		};
	},
	api: [...memoryApiRoutes, ...promptApiRoutes],
	mcp: [...memoryMcpTools, ...promptMcpTools],
	mcpPrompts: { scope: 'prompts:read', list: promptMcpPrompts },
	search: [
		{
			type: 'memory',
			scope: 'memory:read',
			search: async (query, limit, key) => {
				let access = FULL_ACCESS;
				if (key !== null) {
					access = await memoryAccessFor(key);
				}
				return (await searchMemories(query, limit, access)).map((hit) => ({
					type: 'memory',
					id: hit.id,
					title: hit.title,
					snippet: hit.snippet,
					href: `/memory/${hit.id}`,
					external: false,
					score: hit.score
				}));
			}
		},
		{
			type: 'prompt',
			scope: 'prompts:read',
			search: async (query, limit, key) => {
				let access = FULL_ACCESS;
				if (key !== null) {
					access = await memoryAccessFor(key);
				}
				return (await searchPrompts(query, limit, access)).map((hit) => ({
					type: 'prompt',
					id: hit.id,
					title: hit.title,
					snippet: hit.snippet,
					href: `/memory/prompts/${hit.id}`,
					external: false,
					score: hit.score
				}));
			}
		}
	],
	housekeeping: [
		{
			name: 'memory.purge-trash',
			run: async (now) => {
				await purgeTrashedMemories(now, getEnv().TRASH_RETENTION_DAYS);
			}
		}
	],
	usage: async () => {
		const [memories, categories, trash, revisions, prompts] = await Promise.all([
			measureRows(memory, isNull(memory.deletedAt)),
			measureRows(memoryCategory),
			measureRows(memory, isNotNull(memory.deletedAt)),
			measureRows(memoryRevision),
			measureRows(memoryPrompt)
		]);
		return [
			{ id: 'memory.memories', label: m.usage_memories(), ...memories },
			{ id: 'memory.categories', label: m.usage_memory_categories(), ...categories },
			{ id: 'memory.trash', label: m.usage_memories_trash(), ...trash },
			{ id: 'memory.revisions', label: m.usage_memories_revisions(), ...revisions },
			{ id: 'memory.prompts', label: m.usage_prompts(), ...prompts }
		];
	},
	dashboard: () => memoryDashboard()
};
