import { decodeCursor, pageOf, pageQuery } from '$lib/server/api/paging';
import { defineRoute, type ApiRoute } from '$lib/server/api/types';
import { z } from 'zod';
import { markdownToNote } from '../markdown.server';
import { NOTE_TITLE_MAX_LENGTH } from '../schemas';
import {
	addFeature,
	addFeatureWithNewNote,
	deleteFeature,
	getMapFeature,
	listMapFeaturePage,
	updateFeatureGeometry
} from './features.server';
import { mapGeometrySchema, type MapFeatureView } from './geometry';

// /api/v1/map/features: GeoJSON in EPSG:4326, through the same service functions as the map page.

const TAG = 'map';

const idParams = z.object({ id: z.string().meta({ description: 'The feature id.' }) });

const geometry = mapGeometrySchema.meta({
	description: 'A GeoJSON Point, LineString or Polygon in EPSG:4326, at most 10,000 vertices.'
});

const featureResource = z.object({
	type: z.literal('Feature'),
	id: z.string(),
	geometry,
	properties: z.object({
		note_id: z.string(),
		note_title: z.string(),
		kind: z.enum(['point', 'line', 'polygon'])
	})
});

function toFeature(feature: MapFeatureView): z.output<typeof featureResource> {
	return {
		type: 'Feature',
		id: feature.id,
		// Stored geometries passed the same schema on the way in.
		geometry: feature.geometry as z.output<typeof geometry>,
		properties: { note_id: feature.noteId, note_title: feature.noteTitle, kind: feature.kind }
	};
}

/** `west,south,east,north` in degrees. */
const bbox = z
	.string()
	.transform((value, context): [number, number, number, number] => {
		const parts = value.split(',').map((part) => Number(part.trim()));
		const [west, south, east, north] = parts;
		const valid =
			parts.length === 4 &&
			parts.every((part) => Number.isFinite(part)) &&
			west >= -180 &&
			east <= 180 &&
			south >= -90 &&
			north <= 90 &&
			west <= east &&
			south <= north;
		if (!valid) {
			context.addIssue({ code: 'custom', message: 'Use west,south,east,north in degrees.' });
			return z.NEVER;
		}
		return [west, south, east, north];
	})
	.meta({ description: '`west,south,east,north` in degrees: features that intersect it.' });

const newNote = z
	.object({
		title: z.string().max(NOTE_TITLE_MAX_LENGTH).optional(),
		content: z
			.object({ type: z.literal('doc') })
			.loose()
			.optional(),
		markdown: z.string().optional()
	})
	.refine((value) => value.content === undefined || value.markdown === undefined, {
		message: 'Send either content or markdown, not both.',
		path: ['markdown']
	})
	.meta({ description: 'A note to create for the feature, instead of `note_id`.' });

const createBody = z
	.object({
		type: z.literal('Feature'),
		geometry,
		properties: z.record(z.string(), z.unknown()).nullable().optional().meta({
			description: 'Ignored; the note carries the text.'
		}),
		note_id: z.string().optional().meta({ description: 'An existing note to link to.' }),
		note: newNote.optional()
	})
	.refine((value) => (value.note_id === undefined) !== (value.note === undefined), {
		message: 'Send either note_id or note.',
		path: ['note_id']
	});

const featureCursor = z.object({ c: z.iso.datetime(), i: z.uuid() });

export const mapApiRoutes: ApiRoute[] = [
	defineRoute({
		method: 'GET',
		path: '/map/features',
		scope: 'map:read',
		tag: TAG,
		summary: 'List map features',
		description:
			'A GeoJSON FeatureCollection, oldest first; features of notes in the trash are left out. `next_cursor` leads to the next page.',
		query: pageQuery.extend({
			bbox: bbox.optional(),
			note_id: z.string().optional().meta({ description: "Only this note's features." })
		}),
		response: {
			status: 200,
			description: 'A page of features.',
			schema: z.object({
				type: z.literal('FeatureCollection'),
				features: z.array(featureResource),
				next_cursor: z.string().nullable()
			})
		},
		handler: async ({ query }) => {
			const after =
				query.cursor === undefined ? undefined : decodeCursor(query.cursor, featureCursor);
			const rows = await listMapFeaturePage({
				bbox: query.bbox,
				noteId: query.note_id,
				limit: query.limit,
				after:
					after === undefined ? undefined : { createdAt: new Date(after.c), id: after.i }
			});
			const page = pageOf(rows, query.limit, (last) => ({
				c: last.createdAt.toISOString(),
				i: last.id
			}));
			return {
				body: {
					type: 'FeatureCollection',
					features: page.data.map(toFeature),
					next_cursor: page.nextCursor
				}
			};
		}
	}),
	defineRoute({
		method: 'POST',
		path: '/map/features',
		scope: 'map:write',
		tag: TAG,
		summary: 'Add a feature',
		description:
			'Links the geometry to `note_id`, or creates the note described by `note` in the same request.',
		body: createBody,
		response: { status: 201, description: 'The new feature.', schema: featureResource },
		audit: 'map_feature.create',
		handler: async ({ body, actor }) => {
			const created =
				body.note_id !== undefined
					? await addFeature(body.note_id, body.geometry)
					: await addFeatureWithNewNote(body.geometry, actor, {
							title: body.note?.title,
							content:
								body.note?.markdown !== undefined
									? markdownToNote(body.note.markdown)
									: body.note?.content
						});
			return {
				status: 201,
				body: toFeature(created),
				target: { type: 'map_feature', id: created.id }
			};
		}
	}),
	defineRoute({
		method: 'GET',
		path: '/map/features/{id}',
		scope: 'map:read',
		tag: TAG,
		summary: 'Read a feature',
		params: idParams,
		response: { status: 200, description: 'The feature.', schema: featureResource },
		handler: async ({ params }) => ({ body: toFeature(await getMapFeature(params.id)) })
	}),
	defineRoute({
		method: 'PATCH',
		path: '/map/features/{id}',
		scope: 'map:write',
		tag: TAG,
		summary: "Replace a feature's geometry",
		description: 'The geometry keeps its kind: a point stays a point.',
		params: idParams,
		body: z.object({ geometry }),
		response: { status: 200, description: 'The changed feature.', schema: featureResource },
		audit: 'map_feature.update',
		handler: async ({ params, body }) => {
			const updated = await updateFeatureGeometry(params.id, body.geometry);
			return { body: toFeature(updated), target: { type: 'map_feature', id: updated.id } };
		}
	}),
	defineRoute({
		method: 'DELETE',
		path: '/map/features/{id}',
		scope: 'map:write',
		tag: TAG,
		summary: 'Delete a feature',
		description: 'Its note stays.',
		params: idParams,
		response: { status: 204, description: 'The feature is gone.' },
		audit: 'map_feature.delete',
		handler: async ({ params }) => {
			await deleteFeature(params.id);
			return { status: 204, target: { type: 'map_feature', id: params.id } };
		}
	})
];
