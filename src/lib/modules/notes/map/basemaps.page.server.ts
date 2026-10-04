import { m } from '$lib/paraglide/messages.js';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { requireUser } from '$lib/server/guard';
import { textValue } from '$lib/utils/validation';
import { fail, type ActionFailure, type RequestEvent } from '@sveltejs/kit';
import type { BasemapsAction, BasemapsFormState } from './basemaps';
import {
	createBasemap,
	deleteBasemap,
	instanceBasemap,
	listBasemaps,
	moveBasemap,
	updateBasemap,
	useBasemap,
	type MoveDirection
} from './basemaps.server';

// Load and form actions behind /settings/map. The route files only re-export these.

function done(action: BasemapsAction, message: string): BasemapsFormState {
	return { action, success: true, message, errors: {} };
}

function failure(action: BasemapsAction, cause: unknown): ActionFailure<BasemapsFormState> {
	if (cause instanceof ValidationError) {
		return fail(400, { action, success: false, message: '', errors: cause.fields });
	}
	if (cause instanceof NotFoundError) {
		return fail(404, {
			action,
			success: false,
			message: m.basemaps_error_missing(),
			errors: {}
		});
	}
	throw cause;
}

function moveDirection(value: string): MoveDirection {
	if (value === 'up') {
		return 'up';
	}
	return 'down';
}

function basemapFields(data: FormData) {
	return {
		name: textValue(data, 'name'),
		url: textValue(data, 'url'),
		attribution: textValue(data, 'attribution'),
		maxZoom: textValue(data, 'maxZoom')
	};
}

export async function loadBasemapsPage() {
	const instance = instanceBasemap();
	return {
		basemaps: await listBasemaps(),
		// Only the address: the configured attribution is HTML meant for the map.
		standardUrl: instance.url
	};
}

export const basemapsActions = {
	create: async ({ request, locals }: RequestEvent) => {
		requireUser(locals);
		const data = await request.formData();
		try {
			await createBasemap(basemapFields(data));
		} catch (cause) {
			return failure('create', cause);
		}
		return done('create', m.basemaps_created());
	},

	update: async ({ request, locals }: RequestEvent) => {
		requireUser(locals);
		const data = await request.formData();
		try {
			await updateBasemap(textValue(data, 'id'), basemapFields(data));
		} catch (cause) {
			return failure('update', cause);
		}
		return done('update', m.basemaps_updated());
	},

	delete: async ({ request, locals }: RequestEvent) => {
		requireUser(locals);
		const data = await request.formData();
		try {
			await deleteBasemap(textValue(data, 'id'));
		} catch (cause) {
			return failure('delete', cause);
		}
		return done('delete', m.basemaps_deleted());
	},

	move: async ({ request, locals }: RequestEvent) => {
		requireUser(locals);
		const data = await request.formData();
		try {
			await moveBasemap(textValue(data, 'id'), moveDirection(textValue(data, 'direction')));
		} catch (cause) {
			return failure('move', cause);
		}
		return done('move', m.basemaps_reordered());
	},

	/** An empty id puts the standard basemap back in use. */
	use: async ({ request, locals }: RequestEvent) => {
		requireUser(locals);
		const data = await request.formData();
		const id = textValue(data, 'id');
		try {
			if (id === '') {
				await useBasemap(null);
			} else {
				await useBasemap(id);
			}
		} catch (cause) {
			return failure('use', cause);
		}
		return done('use', m.basemaps_used());
	}
};
