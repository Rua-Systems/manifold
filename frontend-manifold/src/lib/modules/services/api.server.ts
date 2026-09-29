import { decodeCursor, pageOf, pageQuery, pageSchema } from '$lib/server/api/paging';
import { defineRoute, type ApiRoute } from '$lib/server/api/types';
import { z } from 'zod';
import { SERVICE_ALIAS_MAX_LENGTH } from './schemas';
import {
	createService,
	deleteService,
	getService,
	listServices,
	reorderServices,
	updateService
} from './services.server';
import type { Service } from './types';

// /api/v1/services: the same service functions as the Services page. Icons are managed on the
// page; the API reads them as `icon_url`.

const TAG = 'services';

const idParams = z.object({ id: z.string().meta({ description: 'The service id.' }) });

const alias = z.string().max(SERVICE_ALIAS_MAX_LENGTH).meta({ description: 'The display name.' });
const url = z.string().meta({ description: 'An http or https address.' });

const serviceResource = z.object({
	id: z.string(),
	alias: z.string(),
	url: z.string(),
	icon_url: z.string().nullable(),
	position: z.number().int()
});

function toResource(item: Service): z.output<typeof serviceResource> {
	return {
		id: item.id,
		alias: item.alias,
		url: item.url,
		icon_url: item.iconFileId === null ? null : `/files/${item.iconFileId}`,
		position: item.position
	};
}

const offsetCursor = z.object({ o: z.number().int().min(0) });

export const servicesApiRoutes: ApiRoute[] = [
	defineRoute({
		method: 'GET',
		path: '/services',
		scope: 'services:read',
		tag: TAG,
		summary: 'List services in their order',
		query: pageQuery,
		response: {
			status: 200,
			description: 'A page of services.',
			schema: pageSchema(serviceResource)
		},
		handler: async ({ query }) => {
			const offset =
				query.cursor === undefined ? 0 : decodeCursor(query.cursor, offsetCursor).o;
			const rows = (await listServices()).slice(offset, offset + query.limit + 1);
			const page = pageOf(rows, query.limit, () => ({ o: offset + query.limit }));
			return { body: { data: page.data.map(toResource), next_cursor: page.nextCursor } };
		}
	}),
	defineRoute({
		method: 'POST',
		path: '/services',
		scope: 'services:write',
		tag: TAG,
		summary: 'Add a service at the end',
		body: z.object({ alias, url }),
		response: { status: 201, description: 'The new service.', schema: serviceResource },
		audit: 'service.create',
		handler: async ({ body }) => {
			const created = await createService(body);
			return {
				status: 201,
				body: toResource(created),
				target: { type: 'service', id: created.id }
			};
		}
	}),
	defineRoute({
		method: 'PUT',
		path: '/services/order',
		scope: 'services:write',
		tag: TAG,
		summary: 'Put the services in a new order',
		description: 'Lists every service id exactly once, in the new order.',
		body: z.object({ ids: z.array(z.string()) }),
		response: {
			status: 200,
			description: 'The services in their new order.',
			schema: z.object({ data: z.array(serviceResource) })
		},
		audit: 'service.reorder',
		handler: async ({ body }) => {
			const ordered = await reorderServices(body.ids);
			return { body: { data: ordered.map(toResource) } };
		}
	}),
	defineRoute({
		method: 'GET',
		path: '/services/{id}',
		scope: 'services:read',
		tag: TAG,
		summary: 'Read a service',
		params: idParams,
		response: { status: 200, description: 'The service.', schema: serviceResource },
		handler: async ({ params }) => ({ body: toResource(await getService(params.id)) })
	}),
	defineRoute({
		method: 'PATCH',
		path: '/services/{id}',
		scope: 'services:write',
		tag: TAG,
		summary: 'Change a service',
		params: idParams,
		body: z.object({ alias: alias.optional(), url: url.optional() }),
		response: { status: 200, description: 'The changed service.', schema: serviceResource },
		audit: 'service.update',
		handler: async ({ params, body }) => {
			const current = await getService(params.id);
			const updated = await updateService(current.id, {
				alias: body.alias ?? current.alias,
				url: body.url ?? current.url
			});
			return { body: toResource(updated), target: { type: 'service', id: updated.id } };
		}
	}),
	defineRoute({
		method: 'DELETE',
		path: '/services/{id}',
		scope: 'services:write',
		tag: TAG,
		summary: 'Delete a service',
		params: idParams,
		response: { status: 204, description: 'The service is gone.' },
		audit: 'service.delete',
		handler: async ({ params }) => {
			await deleteService(params.id);
			return { status: 204, target: { type: 'service', id: params.id } };
		}
	})
];
