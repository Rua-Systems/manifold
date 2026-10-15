import { decodeCursor, pageOf, pageQuery, pageSchema } from '$lib/server/api/paging';
import { defineRoute, type ApiRoute } from '$lib/server/api/types';
import { ValidationError } from '$lib/server/errors';
import { tagsByNames } from '$lib/server/tags/tags';
import { TAG_NAME_MAX_LENGTH, TAGS_PER_RECORD_MAX } from '$lib/schemas/tags';
import { VERSION_MAX } from '$lib/schemas/rules';
import type { Tag } from '$lib/types/tags';
import { z } from 'zod';
import { memoryAccessFor } from '../access.server';
import { categoryLabel, withSubcategories } from '../categories';
import { allMemoryCategories } from '../categories.server';
import type { MemoryCategory } from '../types';
import {
	createPrompt,
	deletePrompt,
	getPrompt,
	listPrompts,
	updatePrompt,
	type PromptFilter
} from './prompts.server';
import {
	nameFromTitle,
	PROMPT_BODY_MAX_LENGTH,
	PROMPT_DESCRIPTION_MAX_LENGTH,
	PROMPT_NAME_MAX_LENGTH,
	PROMPT_TITLE_MAX_LENGTH
} from './schemas';
import type { Prompt } from './types';
import { fillPrompt } from './variables';

// /api/v1/prompts: the prompts of AI Memory, through the same functions as their pages. A key
// limited to some categories reaches only the prompts in them, as it does memories.

const TAG = 'memory';

const NONE = 'none';

const idParams = z.object({ id: z.string().meta({ description: 'The prompt id.' }) });

const tagNames = z
	.array(z.string().max(TAG_NAME_MAX_LENGTH))
	.max(TAGS_PER_RECORD_MAX)
	.meta({ description: 'Tag names from `GET /tags`, in any case.' });

const categoryField = z.string().nullable().meta({
	description: 'A category or subcategory id from `GET /memory-categories`, or null for none.'
});

const nameField = z.string().max(PROMPT_NAME_MAX_LENGTH).meta({
	description:
		'The handle, lower case words joined by hyphens such as `code-review`; the MCP server offers the prompt under it.'
});

const bodyField = z.string().max(PROMPT_BODY_MAX_LENGTH).meta({
	description: 'The text, with `{{name}}` for each place filled in when the prompt is used.'
});

export const promptResource = z.object({
	id: z.string(),
	name: z.string(),
	title: z.string(),
	description: z.string(),
	body: z.string(),
	variables: z.array(z.string()).meta({ description: 'The `{{name}}` places, in order.' }),
	category_id: z.string().nullable(),
	category: z.string(),
	tags: z.array(z.string()),
	version: z.number().int(),
	created_at: z.string(),
	updated_at: z.string()
});

export function toPromptResource(
	prompt: Prompt,
	categories: MemoryCategory[]
): z.output<typeof promptResource> {
	return {
		id: prompt.id,
		name: prompt.name,
		title: prompt.title,
		description: prompt.description,
		body: prompt.body,
		variables: prompt.variables,
		category_id: prompt.categoryId,
		category: categoryLabel(categories, prompt.categoryId),
		tags: prompt.tags.map((item) => item.name),
		version: prompt.version,
		created_at: prompt.createdAt.toISOString(),
		updated_at: prompt.updatedAt.toISOString()
	};
}

/** The service names the category field as the form does; the API calls it `category_id`. */
async function withApiFieldNames<T>(run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (cause) {
		if (cause instanceof ValidationError && cause.fields.category !== undefined) {
			const { category, ...rest } = cause.fields;
			throw new ValidationError({ ...rest, category_id: category });
		}
		throw cause;
	}
}

async function tagsFrom(names: string[] | undefined): Promise<Tag[] | undefined> {
	if (names === undefined) {
		return undefined;
	}
	return tagsByNames(names);
}

const offsetCursor = z.object({ o: z.number().int().min(0) });

export const promptApiRoutes: ApiRoute[] = [
	defineRoute({
		method: 'GET',
		path: '/prompts',
		scope: 'prompts:read',
		tag: TAG,
		summary: 'List prompts by title',
		query: pageQuery.extend({
			q: z.string().max(200).optional().meta({
				description: 'Matches the title, the handle, the description and the text.'
			}),
			category_id: z.string().max(40).optional().meta({
				description:
					'Only prompts in this category and its subcategories, or `none` for those without one.'
			}),
			tags: z
				.string()
				.max(1000)
				.optional()
				.meta({ description: 'Comma separated tag names; only prompts with all of them.' })
		}),
		response: {
			status: 200,
			description: 'A page of prompts.',
			schema: pageSchema(promptResource)
		},
		handler: async ({ query, key }) => {
			const access = await memoryAccessFor(key);
			const categories = await allMemoryCategories();
			const filter: PromptFilter = { query: query.q };
			if (query.category_id === NONE) {
				filter.uncategorized = true;
			} else if (query.category_id !== undefined) {
				filter.categoryIds = [];
				if (categories.some((category) => category.id === query.category_id)) {
					filter.categoryIds = withSubcategories(categories, query.category_id);
				}
			}
			if (query.tags !== undefined) {
				filter.tagIds = (await tagsByNames(query.tags.split(','))).map((item) => item.id);
			}
			let offset = 0;
			if (query.cursor !== undefined) {
				offset = decodeCursor(query.cursor, offsetCursor).o;
			}
			const rows = (await listPrompts(filter, access)).slice(
				offset,
				offset + query.limit + 1
			);
			const page = pageOf(rows, query.limit, () => ({ o: offset + query.limit }));
			return {
				body: {
					data: page.data.map((item) => toPromptResource(item, categories)),
					next_cursor: page.nextCursor
				}
			};
		}
	}),
	defineRoute({
		method: 'POST',
		path: '/prompts',
		scope: 'prompts:write',
		tag: TAG,
		summary: 'Save a prompt',
		description: 'Without `name`, the handle is made from the title.',
		body: z.object({
			name: nameField.optional(),
			title: z.string().max(PROMPT_TITLE_MAX_LENGTH),
			description: z.string().max(PROMPT_DESCRIPTION_MAX_LENGTH).optional(),
			body: bodyField,
			category_id: categoryField.optional(),
			tags: tagNames.optional()
		}),
		response: { status: 201, description: 'The new prompt.', schema: promptResource },
		audit: 'prompt.create',
		handler: async ({ body, key }) => {
			const access = await memoryAccessFor(key);
			const created = await withApiFieldNames(async () =>
				createPrompt(
					{
						name: body.name ?? nameFromTitle(body.title),
						title: body.title,
						description: body.description,
						body: body.body,
						categoryId: body.category_id ?? null,
						tags: await tagsFrom(body.tags)
					},
					access
				)
			);
			return {
				status: 201,
				body: toPromptResource(created, await allMemoryCategories()),
				target: { type: 'prompt', id: created.id }
			};
		}
	}),
	defineRoute({
		method: 'GET',
		path: '/prompts/{id}',
		scope: 'prompts:read',
		tag: TAG,
		summary: 'Read a prompt',
		params: idParams,
		response: { status: 200, description: 'The prompt.', schema: promptResource },
		handler: async ({ params, key }) => {
			const access = await memoryAccessFor(key);
			const found = await getPrompt(params.id, access);
			return { body: toPromptResource(found, await allMemoryCategories()) };
		}
	}),
	defineRoute({
		method: 'PATCH',
		path: '/prompts/{id}',
		scope: 'prompts:write',
		tag: TAG,
		summary: 'Change a prompt',
		description:
			'Every change makes a new version, based on `version`; a different stored version answers 409 with `current_version`.',
		params: idParams,
		body: z.object({
			version: z.number().int().min(1).max(VERSION_MAX),
			name: nameField.optional(),
			title: z.string().max(PROMPT_TITLE_MAX_LENGTH).optional(),
			description: z.string().max(PROMPT_DESCRIPTION_MAX_LENGTH).optional(),
			body: bodyField.optional(),
			category_id: categoryField.optional(),
			tags: tagNames.optional().meta({ description: 'Replaces the tags.' })
		}),
		response: { status: 200, description: 'The changed prompt.', schema: promptResource },
		audit: 'prompt.update',
		handler: async ({ params, body, key }) => {
			const access = await memoryAccessFor(key);
			const updated = await withApiFieldNames(async () =>
				updatePrompt(
					params.id,
					{
						baseVersion: body.version,
						name: body.name,
						title: body.title,
						description: body.description,
						body: body.body,
						categoryId: body.category_id,
						tags: await tagsFrom(body.tags)
					},
					access
				)
			);
			return {
				body: toPromptResource(updated, await allMemoryCategories()),
				target: { type: 'prompt', id: updated.id }
			};
		}
	}),
	defineRoute({
		method: 'DELETE',
		path: '/prompts/{id}',
		scope: 'prompts:write',
		tag: TAG,
		summary: 'Delete a prompt',
		description: 'Prompts have no trash; this cannot be undone.',
		params: idParams,
		response: { status: 204, description: 'The prompt is gone.' },
		audit: 'prompt.delete',
		handler: async ({ params, key }) => {
			const access = await memoryAccessFor(key);
			await deletePrompt(params.id, access);
			return { status: 204, target: { type: 'prompt', id: params.id } };
		}
	}),
	defineRoute({
		method: 'POST',
		path: '/prompts/{id}/render',
		scope: 'prompts:read',
		tag: TAG,
		summary: 'Fill in a prompt',
		description:
			'Fills each `{{name}}` place with the value of the same name. `missing` lists the places left as written.',
		params: idParams,
		body: z.object({
			arguments: z.record(z.string(), z.string().max(PROMPT_BODY_MAX_LENGTH)).default({})
		}),
		response: {
			status: 200,
			description: 'The filled text.',
			schema: z.object({ text: z.string(), missing: z.array(z.string()) })
		},
		handler: async ({ params, body, key }) => {
			const access = await memoryAccessFor(key);
			const found = await getPrompt(params.id, access);
			return {
				body: {
					text: fillPrompt(found.body, body.arguments),
					missing: found.variables.filter((name) => body.arguments[name] === undefined)
				}
			};
		}
	})
];
