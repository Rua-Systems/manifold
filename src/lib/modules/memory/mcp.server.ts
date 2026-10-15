import { callRoute, findRoute } from '$lib/server/mcp/routes';
import { defineTool, type McpTool } from '$lib/server/mcp/types';
import { TAG_NAME_MAX_LENGTH, TAGS_PER_RECORD_MAX } from '$lib/schemas/tags';
import { VERSION_MAX } from '$lib/schemas/rules';
import { z } from 'zod';
import { memoryApiRoutes } from './api.server';
import { MEMORY_TITLE_MAX_LENGTH } from './schemas';

// MCP tools for the shared memory of the owner's agents, running the /api/v1 memory handlers. The
// descriptions tell an agent how to use the memory well: read the context first, search before
// writing, and keep one memory per subject up to date instead of adding near copies.

const memoryId = z.string().describe('The memory id, a UUID as returned by search_memories.');

const tags = z
	.array(z.string().max(TAG_NAME_MAX_LENGTH))
	.max(TAGS_PER_RECORD_MAX)
	.describe(
		'Tag names from get_memory_context or list_tags, in any case. Only existing tags are accepted; agents cannot make new ones.'
	);

const categoryId = z
	.string()
	.nullable()
	.describe(
		'A category or subcategory id from get_memory_context or list_memory_categories, or null for none.'
	);

const route = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string) =>
	findRoute(memoryApiRoutes, method, path);

export const memoryMcpTools: McpTool[] = [
	defineTool({
		name: 'get_memory_context',
		title: 'Read the memory context',
		scope: 'memory:read',
		description:
			"Call this first, at the start of a task. Returns the owner's pinned memories in full (Markdown), the categories (id, path, memory count) and the tags to file memories under, and whether this key is limited to some categories. Find other memories with search_memories. Needs the memory:read scope.",
		input: z.object({}),
		handler: async (_args, context) => {
			const result = await callRoute(route('GET', '/memory/context'), {}, context);
			return { data: result.body };
		}
	}),
	defineTool({
		name: 'search_memories',
		title: 'Search memories',
		scope: 'memory:read',
		description:
			'Finds memories shared by the owner and their agents, newest first, each with an excerpt, its category, tags and version. Narrow by words, a category (its subcategories included, or `none`), tags (all of them) or the pin. Read a memory in full with get_memory. Search before writing, so an existing memory is updated instead of repeated. Answers `next_cursor` for the next page. Needs the memory:read scope.',
		input: z.object({
			query: z.string().max(200).optional().describe('Words in the title or the text.'),
			category_id: z
				.string()
				.max(40)
				.optional()
				.describe('A category id, or `none` for memories without a category.'),
			tags: tags.optional(),
			pinned: z.boolean().optional().describe('Only pinned, or only unpinned memories.'),
			trashed: z.boolean().optional().describe('Search the trash instead.'),
			limit: z.number().int().min(1).max(100).optional(),
			cursor: z.string().max(1000).optional().describe('The next_cursor of the last page.')
		}),
		handler: async (args, context) => {
			let tagList: string | undefined;
			if (args.tags !== undefined) {
				tagList = args.tags.join(',');
			}
			const result = await callRoute(
				route('GET', '/memories'),
				{
					query: {
						q: args.query,
						category_id: args.category_id,
						tags: tagList,
						pinned: args.pinned?.toString(),
						trashed: args.trashed?.toString(),
						limit: args.limit,
						cursor: args.cursor
					}
				},
				context
			);
			return { data: result.body };
		}
	}),
	defineTool({
		name: 'get_memory',
		title: 'Read a memory',
		scope: 'memory:read',
		description:
			'Reads one memory with its text as Markdown, its category, tags, pin and `version`. Remember the version: update_memory needs it. Needs the memory:read scope.',
		input: z.object({ id: memoryId }),
		handler: async (args, context) => {
			const result = await callRoute(
				route('GET', '/memories/{id}'),
				{ params: { id: args.id } },
				context
			);
			return { data: result.body };
		}
	}),
	defineTool({
		name: 'remember',
		title: 'Write a memory',
		scope: 'memory:write',
		audit: 'memory.create',
		description:
			'Saves something worth keeping for the owner and their other agents: a decision, a preference, a fact about a project, how something is done. Give it a short, specific title and the text as Markdown, a category and tags when they fit, and `pinned: true` only for what every task should start with. Search first and update an existing memory instead of writing a near copy. A key limited to categories must name one of its own. Needs the memory:write scope.',
		input: z.object({
			title: z.string().min(1).max(MEMORY_TITLE_MAX_LENGTH),
			markdown: z.string().describe('The text as Markdown. Images are refused.'),
			category_id: categoryId.optional(),
			tags: tags.optional(),
			pinned: z.boolean().optional()
		}),
		handler: async (args, context) => {
			const result = await callRoute(route('POST', '/memories'), { body: args }, context);
			return { data: result.body, target: result.target };
		}
	}),
	defineTool({
		name: 'update_memory',
		title: 'Change a memory',
		scope: 'memory:write',
		audit: 'memory.update',
		description:
			'Changes a memory. A new `title` or `markdown` needs `version`, the version last read with get_memory; if the memory changed since, the call fails with `version_conflict` and `current_version`: read it again, merge and retry. `category_id`, `tags` (which replace the tags) and `pinned` change without a version. Every change keeps the earlier text as a revision the owner can restore. Needs the memory:write scope.',
		input: z.object({
			id: memoryId,
			version: z.number().int().min(1).max(VERSION_MAX).optional(),
			title: z.string().min(1).max(MEMORY_TITLE_MAX_LENGTH).optional(),
			markdown: z.string().optional().describe('The whole new text as Markdown.'),
			category_id: categoryId.optional(),
			tags: tags.optional(),
			pinned: z.boolean().optional()
		}),
		handler: async (args, context) => {
			const { id, ...body } = args;
			const result = await callRoute(
				route('PATCH', '/memories/{id}'),
				{ params: { id }, body },
				context
			);
			return { data: result.body, target: result.target };
		}
	}),
	defineTool({
		name: 'trash_memory',
		title: 'Move a memory to the trash',
		scope: 'memory:write',
		audit: 'memory.trash',
		description:
			'Moves a memory that is wrong or no longer true to the trash. It can be restored with restore_memory until the owner empties the trash; only the owner deletes for good. Needs the memory:write scope.',
		input: z.object({ id: memoryId }),
		handler: async (args, context) => {
			const result = await callRoute(
				route('DELETE', '/memories/{id}'),
				{ params: { id: args.id } },
				context
			);
			return { data: { trashed: true }, target: result.target };
		}
	}),
	defineTool({
		name: 'restore_memory',
		title: 'Take a memory out of the trash',
		scope: 'memory:write',
		audit: 'memory.restore',
		description:
			'Brings a memory back from the trash. Find trashed memories with search_memories and `trashed: true`. Needs the memory:write scope.',
		input: z.object({ id: memoryId }),
		handler: async (args, context) => {
			const result = await callRoute(
				route('POST', '/memories/{id}/restore'),
				{ params: { id: args.id } },
				context
			);
			return { data: result.body, target: result.target };
		}
	}),
	defineTool({
		name: 'list_memory_categories',
		title: 'List memory categories',
		scope: 'memory:read',
		description:
			'Lists the categories and subcategories of memories (id, name, parent, path and memory count). Only the owner makes categories; file memories in these. Needs the memory:read scope.',
		input: z.object({}),
		handler: async (_args, context) => {
			const result = await callRoute(route('GET', '/memory-categories'), {}, context);
			return { data: result.body };
		}
	}),
	defineTool({
		name: 'list_memory_revisions',
		title: "List a memory's revisions",
		scope: 'memory:read',
		description:
			"Lists a memory's revisions, newest first, with who wrote each one (the owner, or an API key by name) and when. Needs the memory:read scope.",
		input: z.object({
			id: memoryId,
			cursor: z.string().max(1000).optional().describe('The next_cursor of the last page.')
		}),
		handler: async (args, context) => {
			const result = await callRoute(
				route('GET', '/memories/{id}/revisions'),
				{ params: { id: args.id }, query: { cursor: args.cursor } },
				context
			);
			return { data: result.body };
		}
	})
];
