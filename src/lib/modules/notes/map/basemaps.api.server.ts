import { decodeCursor, pageOf, pageQuery, pageSchema } from '$lib/server/api/paging';
import { defineRoute, type ApiRoute } from '$lib/server/api/types';
import { ValidationError } from '$lib/server/errors';
import { z } from 'zod';
import {
	BASEMAP_ATTRIBUTION_MAX_LENGTH,
	BASEMAP_DEFAULT_MAX_ZOOM,
	BASEMAP_MAX_ZOOM,
	BASEMAP_NAME_MAX_LENGTH,
	type Basemap
} from './basemaps';
import {
	createBasemap,
	deleteBasemap,
	getBasemap,
	listBasemaps,
	updateBasemap,
	useBasemap
} from './basemaps.server';

// /api/v1/map/basemaps: the owner's basemaps, through the same functions as Settings → Map. The
// standard basemap from MAP_TILE_URL is configuration and not listed; it is in use while no
// basemap is.

const TAG = 'map';

const idParams = z.object({ id: z.string().meta({ description: 'The basemap id.' }) });

const name = z.string().max(BASEMAP_NAME_MAX_LENGTH).meta({ description: 'The display name.' });
const url = z.string().meta({
	description:
		'An https XYZ template with `{z}`, `{x}` and `{y}` or `{-y}`; `{a-c}` picks a subdomain, and `{s}` is read as `{a-c}`.'
});
const attribution = z.string().max(BASEMAP_ATTRIBUTION_MAX_LENGTH).meta({
	description: 'Plain text shown in the corner of the map.'
});
const maxZoom = z
	.number()
	.int()
	.min(0)
	.max(BASEMAP_MAX_ZOOM)
	.meta({
		description: `The deepest zoom the tiles exist for; the map does not zoom further. Defaults to ${BASEMAP_DEFAULT_MAX_ZOOM}.`
	});

const basemapResource = z.object({
	id: z.string(),
	name: z.string(),
	url: z.string(),
	attribution: z.string(),
	max_zoom: z.number().int(),
	in_use: z.boolean(),
	position: z.number().int()
});

function toResource(basemap: Basemap): z.output<typeof basemapResource> {
	return {
		id: basemap.id,
		name: basemap.name,
		url: basemap.url,
		attribution: basemap.attribution,
		max_zoom: basemap.maxZoom,
		in_use: basemap.inUse,
		position: basemap.position
	};
}

/** The service functions name the field `maxZoom`; the API calls it `max_zoom`. */
async function withApiFieldNames<T>(run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (cause) {
		if (cause instanceof ValidationError && cause.fields.maxZoom !== undefined) {
			const { maxZoom: message, ...rest } = cause.fields;
			throw new ValidationError({ ...rest, max_zoom: message });
		}
		throw cause;
	}
}

const offsetCursor = z.object({ o: z.number().int().min(0) });

export const basemapApiRoutes: ApiRoute[] = [
	defineRoute({
		method: 'GET',
		path: '/map/basemaps',
		scope: 'map:read',
		tag: TAG,
		summary: 'List basemaps in their order',
		description:
			'The basemaps added in Settings → Map or through the API. The one with `in_use` shows on every map; while none has it, the maps show the standard basemap of the instance.',
		query: pageQuery,
		response: {
			status: 200,
			description: 'A page of basemaps.',
			schema: pageSchema(basemapResource)
		},
		handler: async ({ query }) => {
			const offset =
				query.cursor === undefined ? 0 : decodeCursor(query.cursor, offsetCursor).o;
			const rows = (await listBasemaps()).slice(offset, offset + query.limit + 1);
			const page = pageOf(rows, query.limit, () => ({ o: offset + query.limit }));
			return { body: { data: page.data.map(toResource), next_cursor: page.nextCursor } };
		}
	}),
	defineRoute({
		method: 'POST',
		path: '/map/basemaps',
		scope: 'map:write',
		tag: TAG,
		summary: 'Add a basemap at the end',
		description: 'The new basemap is not put in use; `PATCH` with `in_use` does that.',
		body: z.object({
			name,
			url,
			attribution: attribution.optional(),
			max_zoom: maxZoom.optional()
		}),
		response: { status: 201, description: 'The new basemap.', schema: basemapResource },
		audit: 'map_basemap.create',
		handler: async ({ body }) => {
			const created = await withApiFieldNames(() =>
				createBasemap({
					name: body.name,
					url: body.url,
					attribution: body.attribution ?? '',
					maxZoom: body.max_zoom ?? BASEMAP_DEFAULT_MAX_ZOOM
				})
			);
			return {
				status: 201,
				body: toResource(created),
				target: { type: 'map_basemap', id: created.id }
			};
		}
	}),
	defineRoute({
		method: 'GET',
		path: '/map/basemaps/{id}',
		scope: 'map:read',
		tag: TAG,
		summary: 'Read a basemap',
		params: idParams,
		response: { status: 200, description: 'The basemap.', schema: basemapResource },
		handler: async ({ params }) => ({ body: toResource(await getBasemap(params.id)) })
	}),
	defineRoute({
		method: 'PATCH',
		path: '/map/basemaps/{id}',
		scope: 'map:write',
		tag: TAG,
		summary: 'Change a basemap or put it in use',
		description:
			'Fields left out keep their value. `in_use: true` puts this basemap in use on every map instead of the one before; `in_use: false` on the basemap in use returns the maps to the standard basemap.',
		params: idParams,
		body: z.object({
			name: name.optional(),
			url: url.optional(),
			attribution: attribution.optional(),
			max_zoom: maxZoom.optional(),
			in_use: z.boolean().optional()
		}),
		response: { status: 200, description: 'The changed basemap.', schema: basemapResource },
		audit: 'map_basemap.update',
		handler: async ({ params, body }) => {
			const current = await getBasemap(params.id);
			const changesFields =
				body.name !== undefined ||
				body.url !== undefined ||
				body.attribution !== undefined ||
				body.max_zoom !== undefined;
			if (changesFields) {
				await withApiFieldNames(() =>
					updateBasemap(current.id, {
						name: body.name ?? current.name,
						url: body.url ?? current.url,
						attribution: body.attribution ?? current.attribution,
						maxZoom: body.max_zoom ?? current.maxZoom
					})
				);
			}
			if (body.in_use === true) {
				await useBasemap(current.id);
			} else if (body.in_use === false && current.inUse) {
				await useBasemap(null);
			}
			const updated = await getBasemap(current.id);
			return { body: toResource(updated), target: { type: 'map_basemap', id: updated.id } };
		}
	}),
	defineRoute({
		method: 'DELETE',
		path: '/map/basemaps/{id}',
		scope: 'map:write',
		tag: TAG,
		summary: 'Delete a basemap',
		description: 'When it was in use, the maps go back to the standard basemap.',
		params: idParams,
		response: { status: 204, description: 'The basemap is gone.' },
		audit: 'map_basemap.delete',
		handler: async ({ params }) => {
			await deleteBasemap(params.id);
			return { status: 204, target: { type: 'map_basemap', id: params.id } };
		}
	})
];
