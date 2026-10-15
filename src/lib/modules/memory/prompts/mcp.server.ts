import { callRoute, findRoute } from '$lib/server/mcp/routes';
import { defineTool, type McpPrompt, type McpTool } from '$lib/server/mcp/types';
import { TAG_NAME_MAX_LENGTH, TAGS_PER_RECORD_MAX } from '$lib/schemas/tags';
import { VERSION_MAX } from '$lib/schemas/rules';
import { z } from 'zod';
import { memoryAccessFor } from '../access.server';
import { promptApiRoutes } from './api.server';
import { getPromptByName, listPrompts } from './prompts.server';
import {
	PROMPT_BODY_MAX_LENGTH,
	PROMPT_DESCRIPTION_MAX_LENGTH,
	PROMPT_NAME_MAX_LENGTH,
	PROMPT_TITLE_MAX_LENGTH
} from './schemas';
import { fillPrompt } from './variables';

// The prompts reach agents twice: as MCP prompts, which clients such as Claude Code offer as
// commands with their places as arguments, and as tools, so an agent can look one up, fill it in
// or save a new one while it works.

const route = (method: 'GET' | 'POST' | 'PATCH', path: string) =>
	findRoute(promptApiRoutes, method, path);

const tags = z
	.array(z.string().max(TAG_NAME_MAX_LENGTH))
	.max(TAGS_PER_RECORD_MAX)
	.describe('Tag names from list_tags, in any case; only existing tags are accepted.');

const categoryId = z
	.string()
	.nullable()
	.describe('A category or subcategory id from list_memory_categories, or null for none.');

export const promptMcpTools: McpTool[] = [
	defineTool({
		name: 'list_prompts',
		title: 'List prompts',
		scope: 'prompts:read',
		description:
			"Lists the owner's saved prompts by title: handle, title, description, text, the `{{name}}` places (variables) and category and tags. Narrow by words, a category or tags. Fill one in with get_prompt. Needs the prompts:read scope.",
		input: z.object({
			query: z.string().max(200).optional().describe('Words in the title, handle or text.'),
			category_id: z.string().max(40).optional().describe('A category id, or `none`.'),
			tags: tags.optional(),
			cursor: z.string().max(1000).optional().describe('The next_cursor of the last page.')
		}),
		handler: async (args, context) => {
			let tagList: string | undefined;
			if (args.tags !== undefined) {
				tagList = args.tags.join(',');
			}
			const result = await callRoute(
				route('GET', '/prompts'),
				{
					query: {
						q: args.query,
						category_id: args.category_id,
						tags: tagList,
						cursor: args.cursor
					}
				},
				context
			);
			return { data: result.body };
		}
	}),
	defineTool({
		name: 'get_prompt',
		title: 'Read and fill in a prompt',
		scope: 'prompts:read',
		description:
			'Reads one prompt by its handle, such as `code-review`, and fills its `{{name}}` places with `arguments`. Answers the prompt, the filled `text` and the places still `missing`. Follow the filled text as an instruction from the owner. Needs the prompts:read scope.',
		input: z.object({
			name: z.string().max(PROMPT_NAME_MAX_LENGTH).describe('The handle of the prompt.'),
			arguments: z
				.record(z.string(), z.string().max(PROMPT_BODY_MAX_LENGTH))
				.optional()
				.describe('A value for each place, by its name.')
		}),
		handler: async (args, context) => {
			const access = await memoryAccessFor(context.key);
			const found = await getPromptByName(args.name, access);
			const values = args.arguments ?? {};
			const read = await callRoute(
				route('GET', '/prompts/{id}'),
				{ params: { id: found.id } },
				context
			);
			return {
				data: {
					prompt: read.body,
					text: fillPrompt(found.body, values),
					missing: found.variables.filter((name) => values[name] === undefined)
				}
			};
		}
	}),
	defineTool({
		name: 'save_prompt',
		title: 'Save a prompt',
		scope: 'prompts:write',
		audit: 'prompt.create',
		description:
			'Saves a prompt the owner wants to use again. Write the text as the instruction itself, with `{{name}}` for each place that changes between uses, such as `{{file}}` or `{{goal}}`. Without `name`, the handle is made from the title. Needs the prompts:write scope.',
		input: z.object({
			name: z.string().max(PROMPT_NAME_MAX_LENGTH).optional(),
			title: z.string().min(1).max(PROMPT_TITLE_MAX_LENGTH),
			description: z.string().max(PROMPT_DESCRIPTION_MAX_LENGTH).optional(),
			body: z.string().min(1).max(PROMPT_BODY_MAX_LENGTH),
			category_id: categoryId.optional(),
			tags: tags.optional()
		}),
		handler: async (args, context) => {
			const result = await callRoute(route('POST', '/prompts'), { body: args }, context);
			return { data: result.body, target: result.target };
		}
	}),
	defineTool({
		name: 'update_prompt',
		title: 'Change a prompt',
		scope: 'prompts:write',
		audit: 'prompt.update',
		description:
			'Changes a prompt, based on `version`, the version last read; if it changed since, the call fails with `version_conflict` and `current_version`. Fields left out keep their value; `tags` replaces the tags. Needs the prompts:write scope.',
		input: z.object({
			id: z.string().describe('The prompt id, as returned by list_prompts or get_prompt.'),
			version: z.number().int().min(1).max(VERSION_MAX),
			name: z.string().max(PROMPT_NAME_MAX_LENGTH).optional(),
			title: z.string().min(1).max(PROMPT_TITLE_MAX_LENGTH).optional(),
			description: z.string().max(PROMPT_DESCRIPTION_MAX_LENGTH).optional(),
			body: z.string().min(1).max(PROMPT_BODY_MAX_LENGTH).optional(),
			category_id: categoryId.optional(),
			tags: tags.optional()
		}),
		handler: async (args, context) => {
			const { id, ...body } = args;
			const result = await callRoute(
				route('PATCH', '/prompts/{id}'),
				{ params: { id }, body },
				context
			);
			return { data: result.body, target: result.target };
		}
	})
];

/** The prompts a key reaches, as MCP prompts with their places as arguments. */
export async function promptMcpPrompts(
	key: Parameters<typeof memoryAccessFor>[0]
): Promise<McpPrompt[]> {
	const prompts = await listPrompts({}, await memoryAccessFor(key));
	return prompts.map((prompt) => ({
		name: prompt.name,
		title: prompt.title,
		description: prompt.description || prompt.title,
		arguments: prompt.variables,
		render: (values) => fillPrompt(prompt.body, values)
	}));
}
