import { localizeHref } from '$lib/paraglide/runtime.js';
import { ConflictError, NotFoundError, ValidationError } from '$lib/server/errors';
import { requireUser } from '$lib/server/guard';
import { listTags, tagsByIds } from '$lib/server/tags/tags';
import { textValue } from '$lib/utils/validation';
import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { withSubcategories } from '../categories';
import { allMemoryCategories } from '../categories.server';
import { memoryVersionSchema } from '../schemas';
import { NEW_PROMPT_ID } from './paths';
import {
	createPrompt,
	deletePrompt,
	getPrompt,
	listPrompts,
	updatePrompt,
	type PromptFilter
} from './prompts.server';

// Loads and form actions behind /memory/prompts. The route files only re-export these.

export async function loadPromptsList(url: URL) {
	const filter = {
		q: (url.searchParams.get('q') ?? '').trim().slice(0, 200),
		category: url.searchParams.get('category') ?? '',
		tag: url.searchParams.get('tag') ?? ''
	};
	const [categories, tags] = await Promise.all([allMemoryCategories(), listTags()]);
	const query: PromptFilter = { query: filter.q };
	if (filter.category === 'none') {
		query.uncategorized = true;
	} else if (filter.category !== '') {
		query.categoryIds = withSubcategories(categories, filter.category);
	}
	if (filter.tag !== '' && tags.some((item) => item.id === filter.tag)) {
		query.tagIds = [filter.tag];
	}
	return { prompts: await listPrompts(query), categories, tags, filter };
}

export async function loadPromptPage(id: string) {
	const [categories, tags] = await Promise.all([allMemoryCategories(), listTags()]);
	if (id === NEW_PROMPT_ID) {
		return { prompt: null, categories, tags };
	}
	try {
		return { prompt: await getPrompt(id), categories, tags };
	} catch (cause) {
		if (cause instanceof NotFoundError) {
			error(404);
		}
		throw cause;
	}
}

async function promptFields(data: FormData) {
	let categoryId: string | null = textValue(data, 'category');
	if (categoryId === '') {
		categoryId = null;
	}
	return {
		name: textValue(data, 'name'),
		title: textValue(data, 'title'),
		description: textValue(data, 'description'),
		body: textValue(data, 'body'),
		categoryId,
		tags: await tagsByIds(data.getAll('tags').filter((value) => typeof value === 'string'))
	};
}

function saveFailure(cause: unknown) {
	if (cause instanceof ConflictError) {
		return fail(409, { conflict: true, errors: {} });
	}
	if (cause instanceof ValidationError) {
		return fail(400, { conflict: false, errors: cause.fields });
	}
	if (cause instanceof NotFoundError) {
		error(404);
	}
	throw cause;
}

export const promptActions = {
	save: async ({ request, locals, params }: RequestEvent) => {
		requireUser(locals);
		const data = await request.formData();
		if (params.id === NEW_PROMPT_ID) {
			let created;
			try {
				created = await createPrompt(await promptFields(data));
			} catch (cause) {
				return saveFailure(cause);
			}
			redirect(303, localizeHref(`/memory/prompts/${created.id}`));
		}
		try {
			const version = memoryVersionSchema.safeParse(textValue(data, 'version'));
			if (!version.success) {
				throw new ConflictError(0);
			}
			await updatePrompt(params.id ?? '', {
				...(await promptFields(data)),
				baseVersion: version.data
			});
		} catch (cause) {
			return saveFailure(cause);
		}
		return { saved: true, conflict: false, errors: {} };
	},

	delete: async ({ locals, params }: RequestEvent) => {
		requireUser(locals);
		try {
			await deletePrompt(params.id ?? '');
		} catch (cause) {
			if (cause instanceof NotFoundError) {
				error(404);
			}
			throw cause;
		}
		redirect(303, localizeHref('/memory/prompts'));
	}
};
