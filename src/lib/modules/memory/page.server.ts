import { m } from '$lib/paraglide/messages.js';
import { localizeHref } from '$lib/paraglide/runtime.js';
import { ownerActor } from '$lib/server/actor';
import { getEnv } from '$lib/server/env';
import { ConflictError, NotFoundError, ValidationError } from '$lib/server/errors';
import { requireUser } from '$lib/server/guard';
import { listTags, tagsByIds } from '$lib/server/tags/tags';
import { isUuid } from '$lib/utils/uuid';
import { textValue } from '$lib/utils/validation';
import { error, fail, redirect, type ActionFailure, type RequestEvent } from '@sveltejs/kit';
import { categoryTree, withSubcategories } from './categories';
import {
	allMemoryCategories,
	createMemoryCategory,
	deleteMemoryCategory,
	getMemoryCategory,
	memoryCountsByCategory,
	renameMemoryCategory
} from './categories.server';
import {
	createMemory,
	deleteMemoryPermanently,
	getMemory,
	getMemoryRevision,
	listMemories,
	listMemoryRevisions,
	restoreMemory,
	restoreMemoryRevision,
	trashMemory,
	updateMemory,
	type MemoryFilter
} from './memories.server';
import { NEW_MEMORY_ID } from './paths';
import { memoryVersionSchema } from './schemas';
import type { MemoryCategoriesAction, MemoryCategoriesFormState, MemoryPreview } from './types';

// Loads and form actions behind /memory. The route files only re-export these.

/** In the list's `category` filter, the memories without a category. */
export const NO_CATEGORY = 'none';

export interface MemoryListFilter {
	q: string;
	/** A category id, `none`, or '' for all. */
	category: string;
	/** A tag id, or '' for all. */
	tag: string;
	pinned: boolean;
}

function filterFrom(url: URL): MemoryListFilter {
	return {
		q: (url.searchParams.get('q') ?? '').trim().slice(0, 200),
		category: url.searchParams.get('category') ?? '',
		tag: url.searchParams.get('tag') ?? '',
		pinned: url.searchParams.get('pinned') === '1'
	};
}

/** The memories, filtered by words, a category with its subcategories, a tag or the pin. */
export async function loadMemoriesList(url: URL) {
	const filter = filterFrom(url);
	const [categories, counts, tags] = await Promise.all([
		allMemoryCategories(),
		memoryCountsByCategory(),
		listTags()
	]);
	const query: MemoryFilter = { query: filter.q };
	if (filter.category === NO_CATEGORY) {
		query.uncategorized = true;
	} else if (filter.category !== '') {
		if (!categories.some((category) => category.id === filter.category)) {
			error(404, { message: m.memory_categories_error_missing() });
		}
		query.categoryIds = withSubcategories(categories, filter.category);
	}
	if (filter.tag !== '' && tags.some((item) => item.id === filter.tag)) {
		query.tagIds = [filter.tag];
	}
	if (filter.pinned) {
		query.pinned = true;
	}
	return {
		memories: await listMemories(query),
		tree: categoryTree(categories, counts),
		categories,
		tags,
		filter
	};
}

/** The editor page, for a memory or for a new one started in `?category=`. */
export async function loadMemoryPage(id: string, url: URL) {
	const [categories, tags] = await Promise.all([allMemoryCategories(), listTags()]);
	if (id === NEW_MEMORY_ID) {
		const category = await getMemoryCategory(url.searchParams.get('category') ?? '');
		return {
			memory: null,
			revisions: [],
			preview: null,
			categories,
			tags,
			newCategoryId: category?.id ?? null
		};
	}
	try {
		const found = await getMemory(id);
		const revisions = await listMemoryRevisions(id);
		let preview: MemoryPreview | null = null;
		const requested = memoryVersionSchema.safeParse(url.searchParams.get('revision'));
		if (url.searchParams.has('revision') && requested.success) {
			const revision = await getMemoryRevision(id, requested.data);
			preview = {
				version: revision.version,
				title: revision.title,
				content: revision.content
			};
		}
		return { memory: found, revisions, preview, categories, tags, newCategoryId: null };
	} catch (cause) {
		if (cause instanceof NotFoundError) {
			error(404);
		}
		throw cause;
	}
}

/** The editor's JSON from a form field. */
function contentValue(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		throw new ValidationError({ content: m.notes_error_content() });
	}
}

function categoryValue(raw: string): string | null {
	if (raw === '') {
		return null;
	}
	return raw;
}

function saveFailure(cause: unknown) {
	if (cause instanceof ConflictError) {
		return fail(409, { conflict: true, currentVersion: cause.currentVersion, errors: {} });
	}
	if (cause instanceof ValidationError) {
		return fail(400, { conflict: false, currentVersion: null, errors: cause.fields });
	}
	if (cause instanceof NotFoundError) {
		error(404);
	}
	throw cause;
}

/** The fields of the editor's form, with the chosen tags looked up. */
async function savedFields(data: FormData) {
	return {
		title: textValue(data, 'title'),
		content: contentValue(textValue(data, 'content')),
		categoryId: categoryValue(textValue(data, 'category')),
		tags: await tagsByIds(data.getAll('tags').filter((value) => typeof value === 'string')),
		pinned: textValue(data, 'pinned') === 'on'
	};
}

export const memoryActions = {
	/** Creates the memory on its first save, then changes it, based on the version shown. */
	save: async ({ request, locals, params }: RequestEvent) => {
		const { user } = requireUser(locals);
		const data = await request.formData();
		const actor = ownerActor(user.id);
		if (params.id === NEW_MEMORY_ID) {
			let created;
			try {
				created = await createMemory(await savedFields(data), actor);
			} catch (cause) {
				return saveFailure(cause);
			}
			redirect(303, localizeHref(`/memory/${created.id}`));
		}
		try {
			const version = memoryVersionSchema.safeParse(textValue(data, 'version'));
			if (!version.success) {
				throw new ValidationError({ version: m.memory_error_version_needed() });
			}
			const updated = await updateMemory(
				params.id ?? '',
				{ ...(await savedFields(data)), baseVersion: version.data },
				actor
			);
			return { saved: true, version: updated.version, message: m.memory_saved() };
		} catch (cause) {
			return saveFailure(cause);
		}
	},

	trash: async ({ locals, params }: RequestEvent) => {
		requireUser(locals);
		try {
			await trashMemory(params.id ?? '');
		} catch (cause) {
			if (cause instanceof NotFoundError) {
				error(404);
			}
			throw cause;
		}
		redirect(303, localizeHref('/memory'));
	},

	restoreRevision: async ({ request, locals, params }: RequestEvent) => {
		const { user } = requireUser(locals);
		const data = await request.formData();
		const version = memoryVersionSchema.safeParse(textValue(data, 'revision'));
		if (!version.success) {
			error(404);
		}
		try {
			await restoreMemoryRevision(params.id ?? '', version.data, ownerActor(user.id));
		} catch (cause) {
			if (cause instanceof NotFoundError) {
				error(404);
			}
			throw cause;
		}
		redirect(303, localizeHref(`/memory/${params.id}`));
	}
};

export async function loadMemoryTrash() {
	const [memories, categories] = await Promise.all([
		listMemories({ trashed: true }),
		allMemoryCategories()
	]);
	return { memories, categories, retentionDays: getEnv().TRASH_RETENTION_DAYS };
}

function trashFailure(cause: unknown) {
	if (cause instanceof NotFoundError) {
		return fail(404, { message: m.memory_error_gone() });
	}
	if (cause instanceof ValidationError) {
		return fail(400, { message: Object.values(cause.fields)[0] ?? '' });
	}
	throw cause;
}

export const memoryTrashActions = {
	restore: async ({ request, locals }: RequestEvent) => {
		requireUser(locals);
		const id = textValue(await request.formData(), 'id');
		try {
			await restoreMemory(id);
		} catch (cause) {
			return trashFailure(cause);
		}
		return { message: m.memory_restored() };
	},

	delete: async ({ request, locals }: RequestEvent) => {
		requireUser(locals);
		const id = textValue(await request.formData(), 'id');
		try {
			if (!isUuid(id)) {
				throw new NotFoundError('Memory');
			}
			await deleteMemoryPermanently(id);
		} catch (cause) {
			return trashFailure(cause);
		}
		return { message: m.memory_deleted() };
	}
};

export async function loadCategoriesPage() {
	const [categories, counts] = await Promise.all([
		allMemoryCategories(),
		memoryCountsByCategory()
	]);
	return { tree: categoryTree(categories, counts) };
}

function categoryDone(action: MemoryCategoriesAction, message: string): MemoryCategoriesFormState {
	return { action, success: true, message, errors: {} };
}

function categoryFailure(
	action: MemoryCategoriesAction,
	cause: unknown
): ActionFailure<MemoryCategoriesFormState> {
	if (cause instanceof ValidationError) {
		return fail(400, {
			action,
			success: false,
			message: cause.fields.category ?? '',
			errors: cause.fields
		});
	}
	if (cause instanceof NotFoundError) {
		return fail(404, {
			action,
			success: false,
			message: m.memory_categories_error_missing(),
			errors: {}
		});
	}
	throw cause;
}

export const memoryCategoryActions = {
	create: async ({ request, locals }: RequestEvent) => {
		requireUser(locals);
		const data = await request.formData();
		try {
			await createMemoryCategory({
				name: textValue(data, 'name'),
				parentId: categoryValue(textValue(data, 'parent'))
			});
		} catch (cause) {
			return categoryFailure('create', cause);
		}
		return categoryDone('create', m.memory_categories_created());
	},

	rename: async ({ request, locals }: RequestEvent) => {
		requireUser(locals);
		const data = await request.formData();
		try {
			await renameMemoryCategory(textValue(data, 'id'), textValue(data, 'name'));
		} catch (cause) {
			return categoryFailure('rename', cause);
		}
		return categoryDone('rename', m.memory_categories_renamed());
	},

	delete: async ({ request, locals }: RequestEvent) => {
		requireUser(locals);
		const data = await request.formData();
		try {
			await deleteMemoryCategory(textValue(data, 'id'));
		} catch (cause) {
			return categoryFailure('delete', cause);
		}
		return categoryDone('delete', m.memory_categories_deleted());
	}
};
