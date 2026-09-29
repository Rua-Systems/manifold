import { m } from '$lib/paraglide/messages.js';
import { getEnv } from '$lib/server/env';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { requireUser } from '$lib/server/guard';
import { textValue } from '$lib/utils/validation';
import { fail, type ActionFailure, type RequestEvent } from '@sveltejs/kit';
import { serviceIconSource, serviceInitial } from './manifest.server';
import {
	createService,
	deleteService,
	listServices,
	moveService,
	reorderServices,
	updateService
} from './services.server';
import type { MoveDirection, ServicesAction, ServicesFormState, ServiceView } from './types';

// Load and form actions behind /services. The route files only re-export these.

function done(action: ServicesAction, message: string): ServicesFormState {
	return { action, success: true, message, errors: {} };
}

function failure(action: ServicesAction, cause: unknown): ActionFailure<ServicesFormState> {
	if (cause instanceof ValidationError) {
		return fail(400, { action, success: false, message: '', errors: cause.fields });
	}
	if (cause instanceof NotFoundError) {
		return fail(404, {
			action,
			success: false,
			message: m.services_error_missing(),
			errors: {}
		});
	}
	throw cause;
}

function uploadedFile(data: FormData, name: string): File | null {
	const value = data.get(name);
	if (value instanceof File && value.size > 0) {
		return value;
	}
	return null;
}

function moveDirection(value: string): MoveDirection {
	if (value === 'up') {
		return 'up';
	}
	return 'down';
}

export async function loadServicesPage() {
	const services = await listServices();
	return {
		services: services.map((item): ServiceView => ({
			id: item.id,
			alias: item.alias,
			url: item.url,
			iconSrc: serviceIconSource(item),
			initial: serviceInitial(item.alias)
		})),
		uploadMaxBytes: getEnv().UPLOAD_MAX_BYTES
	};
}

export const servicesActions = {
	create: async ({ request, locals }: RequestEvent) => {
		requireUser(locals);
		const data = await request.formData();
		try {
			await createService(
				{ alias: textValue(data, 'alias'), url: textValue(data, 'url') },
				uploadedFile(data, 'icon')
			);
		} catch (cause) {
			return failure('create', cause);
		}
		return done('create', m.services_created());
	},

	update: async ({ request, locals }: RequestEvent) => {
		requireUser(locals);
		const data = await request.formData();
		try {
			await updateService(
				textValue(data, 'id'),
				{ alias: textValue(data, 'alias'), url: textValue(data, 'url') },
				{ icon: uploadedFile(data, 'icon'), removeIcon: data.get('removeIcon') === 'on' }
			);
		} catch (cause) {
			return failure('update', cause);
		}
		return done('update', m.services_updated());
	},

	delete: async ({ request, locals }: RequestEvent) => {
		requireUser(locals);
		const data = await request.formData();
		try {
			await deleteService(textValue(data, 'id'));
		} catch (cause) {
			return failure('delete', cause);
		}
		return done('delete', m.services_deleted());
	},

	move: async ({ request, locals }: RequestEvent) => {
		requireUser(locals);
		const data = await request.formData();
		try {
			await moveService(textValue(data, 'id'), moveDirection(textValue(data, 'direction')));
		} catch (cause) {
			return failure('move', cause);
		}
		return done('move', m.services_reordered());
	},

	reorder: async ({ request, locals }: RequestEvent) => {
		requireUser(locals);
		const data = await request.formData();
		const ids = data.getAll('id').filter((value): value is string => typeof value === 'string');
		try {
			await reorderServices(ids);
		} catch (cause) {
			return failure('reorder', cause);
		}
		return done('reorder', m.services_reordered());
	}
};
