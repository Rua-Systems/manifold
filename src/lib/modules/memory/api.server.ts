import { decodeCursor, pageOf, pageQuery, pageSchema } from '$lib/server/api/paging';
import { defineRoute, type ApiRoute } from '$lib/server/api/types';
import { ValidationError } from '$lib/server/errors';
import { tagResource, toTagResource } from '$lib/server/tags/api';
import { listTags, tagsByNames } from '$lib/server/tags/tags';
import { TAG_NAME_MAX_LENGTH, TAGS_PER_RECORD_MAX } from '$lib/schemas/tags';
import { VERSION_MAX } from '$lib/schemas/rules';
import type { Tag } from '$lib/types/tags';
import { z } from 'zod';
import { noteToMarkdown } from '../notes/markdown.server';
import { memoryAccessFor, type MemoryAccess } from './access.server';
import { categoryLabel, withSubcategories } from './categories';
import { allMemoryCategories, memoryCountsByCategory } from './categories.server';
import { markdownToMemory } from './content.server';
import {
	createMemory,
	getMemory,
	getMemoryRevision,
	listMemoryPage,
	listMemoryRevisions,
	pinnedMemories,
	restoreMemory,
	trashMemory,
	updateMemory,
	type MemoryFilter
} from './memories.server';
import { MEMORY_TITLE_MAX_LENGTH } from './schemas';
import type { MemoryCategory, MemoryDetail } from './types';

// /api/v1/memories, /api/v1/memory-categories and /api/v1/memory/context: the same service
// functions as the AI Memory pages. Content goes in and out as Markdown, which is what agents
// write and read; tags go by name. A key limited to some categories reaches only the memories in
// them, and everything else answers as if it did not exist.

const TAG = 'memory';

/** In `category_id`, memories without a category. */
const NONE = 'none';

const idParams = z.object({ id: z.string().meta({ description: 'The memory id.' }) });

const revisionParams = idParams.extend({
	version: z.coerce
		.number()
		.int()
		.min(1)
		.max(VERSION_MAX)
		.meta({ description: 'The revision version.' })
});

const tagNames = z.array(z.string().max(TAG_NAME_MAX_LENGTH)).max(TAGS_PER_RECORD_MAX).meta({
	description: 'Tag names from `GET /tags`, in any case. A name that is not a tag is refused.'
});

const categoryField = z.string().nullable().meta({
	description:
		'A category or subcategory id from `GET /memory-categories`, or null for none. A key limited to categories must name one of its own.'
});

const markdownField = z
	.string()
	.meta({ description: 'The text as Markdown; raw HTML is dropped, and images are refused.' });

const createBody = z.object({
	title: z.string().max(MEMORY_TITLE_MAX_LENGTH),
	markdown: markdownField.optional(),
	category_id: categoryField.optional(),
	tags: tagNames.optional(),
	pinned: z.boolean().optional().meta({ description: 'Pinned memories head the context.' })
});

function changesText(body: { title?: string; markdown?: string }): boolean {
	return body.title !== undefined || body.markdown !== undefined;
}

const updateBody = z
	.object({
		version: z.number().int().min(1).max(VERSION_MAX).optional().meta({
			description:
				'The version the change is based on; a different stored version answers 409. Needed with `title` or `markdown`.'
		}),
		title: z.string().max(MEMORY_TITLE_MAX_LENGTH).optional(),
		markdown: markdownField.optional(),
		category_id: categoryField.optional(),
		tags: tagNames
			.optional()
			.meta({ description: 'Replaces the tags; `[]` removes them all.' }),
		pinned: z.boolean().optional()
	})
	.refine((body) => !changesText(body) || body.version !== undefined, {
		message: 'Send the version the change is based on.',
		path: ['version']
	})
	.refine(
		(body) =>
			changesText(body) ||
			body.category_id !== undefined ||
			body.tags !== undefined ||
			body.pinned !== undefined,
		{ message: 'Send title, markdown, category_id, tags or pinned.' }
	);

const memoryFields = {
	id: z.string(),
	title: z.string(),
	version: z.number().int(),
	category_id: z.string().nullable(),
	category: z
		.string()
		.meta({ description: '`Category / Subcategory`, the category name, or empty for none.' }),
	pinned: z.boolean(),
	tags: z.array(z.string()),
	updated_at: z.string(),
	deleted_at: z.string().nullable()
};

const memoryResource = z.object({
	...memoryFields,
	markdown: z.string(),
	created_at: z.string()
});

const memoryListItem = z.object({ ...memoryFields, excerpt: z.string() });

const revisionListItem = z.object({
	version: z.number().int(),
	title: z.string(),
	actor_type: z.enum(['owner', 'api_key', 'system']),
	actor_id: z.string().nullable(),
	actor_name: z
		.string()
		.nullable()
		.meta({ description: 'The API key name while the key exists.' }),
	created_at: z.string(),
	updated_at: z.string()
});

const revisionResource = revisionListItem.extend({ markdown: z.string() });

const categoryResource = z.object({
	id: z.string(),
	name: z.string(),
	parent_id: z.string().nullable().meta({ description: 'Null for a category at the top.' }),
	path: z.string().meta({ description: '`Category / Subcategory`, or the name at the top.' }),
	memory_count: z
		.number()
		.int()
		.meta({ description: 'Memories outside the trash directly in it.' })
});

const memoryCursor = z.object({ u: z.iso.datetime(), i: z.uuid() });
const revisionCursor = z.object({ v: z.number().int() });

function tagNamesOf(tags: Tag[]): string[] {
	return tags.map((item) => item.name);
}

function toMemoryResource(
	item: MemoryDetail,
	categories: MemoryCategory[]
): z.output<typeof memoryResource> {
	return {
		id: item.id,
		title: item.title,
		version: item.version,
		category_id: item.categoryId,
		category: categoryLabel(categories, item.categoryId),
		pinned: item.pinned,
		tags: tagNamesOf(item.tags),
		markdown: noteToMarkdown(item.content),
		created_at: item.createdAt.toISOString(),
		updated_at: item.updatedAt.toISOString(),
		deleted_at: item.deletedAt?.toISOString() ?? null
	};
}

/** The service functions name fields as the forms do; the API names them as it takes them. */
async function withApiFieldNames<T>(run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (cause) {
		if (cause instanceof ValidationError) {
			const { content, category, ...rest } = cause.fields;
			const fields = { ...rest };
			if (content !== undefined) {
				fields.markdown = content;
			}
			if (category !== undefined) {
				fields.category_id = category;
			}
			throw new ValidationError(fields);
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

function contentFrom(markdown: string | undefined): unknown {
	if (markdown === undefined) {
		return undefined;
	}
	return markdownToMemory(markdown);
}

/** The categories a list's `category_id` stands for, with their subcategories. */
function categoryFilter(
	value: string | undefined,
	categories: MemoryCategory[]
): Pick<MemoryFilter, 'categoryIds' | 'uncategorized'> {
	if (value === undefined) {
		return {};
	}
	if (value === NONE) {
		return { uncategorized: true };
	}
	if (!categories.some((category) => category.id === value)) {
		return { categoryIds: [] };
	}
	return { categoryIds: withSubcategories(categories, value) };
}

/** The categories within reach; a reached subcategory's path still names its parent. */
function visibleCategories(categories: MemoryCategory[], access: MemoryAccess): MemoryCategory[] {
	if (access.all) {
		return categories;
	}
	return categories.filter((category) => access.categoryIds.includes(category.id));
}

export const memoryApiRoutes: ApiRoute[] = [
	defineRoute({
		method: 'GET',
		path: '/memories',
		scope: 'memory:read',
		tag: TAG,
		summary: 'List memories by last update',
		query: pageQuery.extend({
			q: z.string().max(200).optional().meta({ description: 'Matches title and text.' }),
			category_id: z.string().max(40).optional().meta({
				description:
					'Only memories in this category and its subcategories, or `none` for those without a category.'
			}),
			tags: z.string().max(1000).optional().meta({
				description: 'Comma separated tag names; only memories with all of them.'
			}),
			pinned: z
				.stringbool()
				.optional()
				.meta({ description: 'Only pinned, or only unpinned.' }),
			trashed: z.stringbool().default(false).meta({ description: 'The trash instead.' })
		}),
		response: {
			status: 200,
			description: 'A page of memories.',
			schema: pageSchema(memoryListItem)
		},
		handler: async ({ query, key }) => {
			const access = await memoryAccessFor(key);
			const categories = await allMemoryCategories();
			let after: { updatedAt: Date; id: string } | undefined;
			if (query.cursor !== undefined) {
				const position = decodeCursor(query.cursor, memoryCursor);
				after = { updatedAt: new Date(position.u), id: position.i };
			}
			let tagIds: string[] | undefined;
			if (query.tags !== undefined) {
				const names = query.tags.split(',');
				tagIds = (await withApiFieldNames(() => tagsByNames(names))).map((item) => item.id);
			}
			const rows = await listMemoryPage(
				{
					query: query.q,
					...categoryFilter(query.category_id, categories),
					tagIds,
					pinned: query.pinned,
					trashed: query.trashed
				},
				{ limit: query.limit, after },
				access
			);
			const page = pageOf(rows, query.limit, (last) => ({
				u: last.updatedAt.toISOString(),
				i: last.id
			}));
			return {
				body: {
					data: page.data.map((item) => ({
						id: item.id,
						title: item.title,
						excerpt: item.excerpt,
						version: item.version,
						category_id: item.categoryId,
						category: categoryLabel(categories, item.categoryId),
						pinned: item.pinned,
						tags: tagNamesOf(item.tags),
						updated_at: item.updatedAt.toISOString(),
						deleted_at: item.deletedAt?.toISOString() ?? null
					})),
					next_cursor: page.nextCursor
				}
			};
		}
	}),
	defineRoute({
		method: 'POST',
		path: '/memories',
		scope: 'memory:write',
		tag: TAG,
		summary: 'Write a memory',
		description:
			'A title, Markdown, and optionally a category, tags and a pin. A key limited to categories must name one of its own.',
		body: createBody,
		response: { status: 201, description: 'The new memory.', schema: memoryResource },
		audit: 'memory.create',
		handler: async ({ body, key, actor }) => {
			const access = await memoryAccessFor(key);
			const created = await withApiFieldNames(async () =>
				createMemory(
					{
						title: body.title,
						content: contentFrom(body.markdown),
						categoryId: body.category_id ?? null,
						tags: await tagsFrom(body.tags),
						pinned: body.pinned
					},
					actor,
					access
				)
			);
			return {
				status: 201,
				body: toMemoryResource(created, await allMemoryCategories()),
				target: { type: 'memory', id: created.id }
			};
		}
	}),
	defineRoute({
		method: 'GET',
		path: '/memories/{id}',
		scope: 'memory:read',
		tag: TAG,
		summary: 'Read a memory',
		description: 'Memories in the trash can be read too; `deleted_at` tells.',
		params: idParams,
		response: { status: 200, description: 'The memory.', schema: memoryResource },
		handler: async ({ params, key }) => {
			const access = await memoryAccessFor(key);
			const found = await getMemory(params.id, { includeTrashed: true }, access);
			return { body: toMemoryResource(found, await allMemoryCategories()) };
		}
	}),
	defineRoute({
		method: 'PATCH',
		path: '/memories/{id}',
		scope: 'memory:write',
		tag: TAG,
		summary: 'Change a memory',
		description:
			'A new title or Markdown writes a new version and a new revision, based on `version`; a different stored version answers 409 with `current_version`. `category_id`, `tags` and `pinned` change without a new version, and need no `version` when sent alone.',
		params: idParams,
		body: updateBody,
		response: { status: 200, description: 'The changed memory.', schema: memoryResource },
		audit: 'memory.update',
		handler: async ({ params, body, key, actor }) => {
			const access = await memoryAccessFor(key);
			const updated = await withApiFieldNames(async () =>
				updateMemory(
					params.id,
					{
						baseVersion: body.version,
						title: body.title,
						content: contentFrom(body.markdown),
						categoryId: body.category_id,
						tags: await tagsFrom(body.tags),
						pinned: body.pinned
					},
					actor,
					access
				)
			);
			return {
				body: toMemoryResource(updated, await allMemoryCategories()),
				target: { type: 'memory', id: updated.id }
			};
		}
	}),
	defineRoute({
		method: 'DELETE',
		path: '/memories/{id}',
		scope: 'memory:write',
		tag: TAG,
		summary: 'Move a memory to the trash',
		description: 'Only the owner empties the trash; until then, `restore` brings it back.',
		params: idParams,
		response: { status: 204, description: 'The memory is in the trash.' },
		audit: 'memory.trash',
		handler: async ({ params, key }) => {
			const access = await memoryAccessFor(key);
			const found = await getMemory(params.id, {}, access);
			await trashMemory(found.id, access);
			return { status: 204, target: { type: 'memory', id: found.id } };
		}
	}),
	defineRoute({
		method: 'POST',
		path: '/memories/{id}/restore',
		scope: 'memory:write',
		tag: TAG,
		summary: 'Take a memory out of the trash',
		params: idParams,
		response: { status: 200, description: 'The restored memory.', schema: memoryResource },
		audit: 'memory.restore',
		handler: async ({ params, key }) => {
			const access = await memoryAccessFor(key);
			const restored = await restoreMemory(params.id, access);
			return {
				body: toMemoryResource(restored, await allMemoryCategories()),
				target: { type: 'memory', id: restored.id }
			};
		}
	}),
	defineRoute({
		method: 'GET',
		path: '/memories/{id}/revisions',
		scope: 'memory:read',
		tag: TAG,
		summary: "List a memory's revisions, newest first",
		description: 'Each with who wrote it: the owner, or an API key by id and name.',
		params: idParams,
		query: pageQuery,
		response: {
			status: 200,
			description: 'A page of revisions.',
			schema: pageSchema(revisionListItem)
		},
		handler: async ({ params, query, key }) => {
			const access = await memoryAccessFor(key);
			let before = Number.POSITIVE_INFINITY;
			if (query.cursor !== undefined) {
				before = decodeCursor(query.cursor, revisionCursor).v;
			}
			const all = await listMemoryRevisions(params.id, access);
			const rows = all.filter((item) => item.version < before);
			const page = pageOf(rows.slice(0, query.limit + 1), query.limit, (last) => ({
				v: last.version
			}));
			return {
				body: {
					data: page.data.map((item) => ({
						version: item.version,
						title: item.title,
						actor_type: item.actorType,
						actor_id: item.actorId,
						actor_name: item.actorName,
						created_at: item.createdAt.toISOString(),
						updated_at: item.updatedAt.toISOString()
					})),
					next_cursor: page.nextCursor
				}
			};
		}
	}),
	defineRoute({
		method: 'GET',
		path: '/memories/{id}/revisions/{version}',
		scope: 'memory:read',
		tag: TAG,
		summary: 'Read a revision of a memory',
		params: revisionParams,
		response: { status: 200, description: 'The revision.', schema: revisionResource },
		handler: async ({ params, key }) => {
			const access = await memoryAccessFor(key);
			const revision = await getMemoryRevision(params.id, params.version, access);
			const named = (await listMemoryRevisions(params.id, access)).find(
				(item) => item.version === revision.version
			);
			return {
				body: {
					version: revision.version,
					title: revision.title,
					actor_type: revision.actorType,
					actor_id: revision.actorId,
					actor_name: named?.actorName ?? null,
					created_at: revision.createdAt.toISOString(),
					updated_at: revision.updatedAt.toISOString(),
					markdown: noteToMarkdown(revision.content)
				}
			};
		}
	}),
	defineRoute({
		method: 'GET',
		path: '/memory-categories',
		scope: 'memory:read',
		tag: TAG,
		summary: 'List memory categories',
		description:
			'Categories and their subcategories by name, only those a limited key reaches. Only the owner makes categories.',
		response: {
			status: 200,
			description: 'Every category within reach.',
			schema: z.object({ data: z.array(categoryResource) })
		},
		handler: async ({ key }) => {
			const access = await memoryAccessFor(key);
			const [categories, counts] = await Promise.all([
				allMemoryCategories(),
				memoryCountsByCategory()
			]);
			return {
				body: {
					data: visibleCategories(categories, access).map((category) => ({
						id: category.id,
						name: category.name,
						parent_id: category.parentId,
						path: categoryLabel(categories, category.id),
						memory_count: counts[category.id] ?? 0
					}))
				}
			};
		}
	}),
	defineRoute({
		method: 'GET',
		path: '/memory/context',
		scope: 'memory:read',
		tag: TAG,
		summary: 'What an agent reads first',
		description:
			'The pinned memories within reach, whole, newest first, with the categories and the tags to file new memories under. Read the rest with the search or `GET /memories`.',
		response: {
			status: 200,
			description: 'The context.',
			schema: z.object({
				pinned: z.array(memoryResource),
				categories: z.array(categoryResource),
				tags: z.array(tagResource),
				limited: z
					.boolean()
					.meta({ description: 'Whether this key reaches only some categories.' })
			})
		},
		handler: async ({ key }) => {
			const access = await memoryAccessFor(key);
			const [pinned, categories, counts, tags] = await Promise.all([
				pinnedMemories(access),
				allMemoryCategories(),
				memoryCountsByCategory(),
				listTags()
			]);
			return {
				body: {
					pinned: pinned.map((item) => toMemoryResource(item, categories)),
					categories: visibleCategories(categories, access).map((category) => ({
						id: category.id,
						name: category.name,
						parent_id: category.parentId,
						path: categoryLabel(categories, category.id),
						memory_count: counts[category.id] ?? 0
					})),
					tags: tags.map(toTagResource),
					limited: !access.all
				}
			};
		}
	})
];
