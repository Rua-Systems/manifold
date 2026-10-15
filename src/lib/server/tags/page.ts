import { m } from '$lib/paraglide/messages.js';
import type { TagsAction, TagsFormState } from '$lib/types/tags';
import { textValue } from '$lib/utils/validation';
import { fail, type ActionFailure, type RequestEvent } from '@sveltejs/kit';
import { NotFoundError, ValidationError } from '../errors';
import { requireUser } from '../guard';
import { createTag, deleteTag, listTags, updateTag } from './tags';

// Load and form actions behind /settings/tags. The route files only re-export these.

function done(action: TagsAction, message: string): TagsFormState {
	return { action, success: true, message, errors: {} };
}

function failure(action: TagsAction, cause: unknown): ActionFailure<TagsFormState> {
	if (cause instanceof ValidationError) {
		return fail(400, { action, success: false, message: '', errors: cause.fields });
	}
	if (cause instanceof NotFoundError) {
		return fail(404, { action, success: false, message: m.tags_error_gone(), errors: {} });
	}
	throw cause;
}

function tagFields(data: FormData) {
	return { name: textValue(data, 'name'), color: textValue(data, 'color') };
}

export async function loadTagsPage() {
	return { tags: await listTags() };
}

export const tagsActions = {
	create: async ({ request, locals }: RequestEvent) => {
		requireUser(locals);
		const data = await request.formData();
		try {
			await createTag(tagFields(data));
		} catch (cause) {
			return failure('create', cause);
		}
		return done('create', m.tags_created());
	},

	update: async ({ request, locals }: RequestEvent) => {
		requireUser(locals);
		const data = await request.formData();
		try {
			await updateTag(textValue(data, 'id'), tagFields(data));
		} catch (cause) {
			return failure('update', cause);
		}
		return done('update', m.tags_updated());
	},

	delete: async ({ request, locals }: RequestEvent) => {
		requireUser(locals);
		const data = await request.formData();
		try {
			await deleteTag(textValue(data, 'id'));
		} catch (cause) {
			return failure('delete', cause);
		}
		return done('delete', m.tags_deleted());
	}
};
