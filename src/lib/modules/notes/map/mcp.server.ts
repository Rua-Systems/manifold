import { callRoute, findRoute } from '$lib/server/mcp/routes';
import { defineTool, type McpTool } from '$lib/server/mcp/types';
import { z } from 'zod';
import { mapApiRoutes } from './api.server';

// MCP tools for map features, running the /api/v1/map handlers. Geometries are GeoJSON in
// EPSG:4326: [longitude, latitude].

const featureId = z.string().describe('The feature id, a UUID as returned by list_map_features.');

const geometry = z
	.object({
		type: z.enum(['Point', 'LineString', 'Polygon']),
		coordinates: z.array(z.unknown())
	})
	.loose()
	.describe(
		'A GeoJSON geometry in longitude, latitude order: a Point, a LineString of at least 2 positions, or a Polygon whose rings are closed (first position repeated last). At most 10,000 positions; self-intersecting shapes are refused.'
	);

const route = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string) =>
	findRoute(mapApiRoutes, method, path);

export const mapMcpTools: McpTool[] = [
	defineTool({
		name: 'list_map_features',
		title: 'List map features',
		scope: 'map:read',
		description:
			'Lists map features as a GeoJSON FeatureCollection, oldest first; each feature carries its note_id, note_title and kind (point, line, polygon). Narrow it with `bbox` ("west,south,east,north" in degrees) or `note_id`. Features of notes in the trash are left out. Page with `cursor` from `next_cursor`. Needs the map:read scope.',
		input: z.object({
			bbox: z.string().optional().describe('west,south,east,north in degrees.'),
			note_id: z.string().optional().describe("Only this note's features."),
			limit: z.number().int().min(1).max(100).optional(),
			cursor: z.string().optional()
		}),
		handler: async (args, context) => {
			const result = await callRoute(route('GET', '/map/features'), { query: args }, context);
			return { data: result.body };
		}
	}),
	defineTool({
		name: 'create_map_feature',
		title: 'Add a map feature',
		scope: 'map:write',
		description:
			'Places a geometry on the map and links it to a note: give `note_id` to link an existing note, or `note_title` (and optional `note_markdown`) to create a new note for it in the same step. Give one of the two, not both. Needs the map:write scope, and a new note is written as notes are.',
		input: z.object({
			geometry,
			note_id: z.string().optional().describe('An existing note to link the feature to.'),
			note_title: z
				.string()
				.max(200)
				.optional()
				.describe('Title of a new note for the feature.'),
			note_markdown: z.string().optional().describe('Content of that new note, as Markdown.')
		}),
		audit: 'map_feature.create',
		handler: async (args, context) => {
			const createsNote = args.note_title !== undefined || args.note_markdown !== undefined;
			const result = await callRoute(
				route('POST', '/map/features'),
				{
					body: {
						type: 'Feature',
						geometry: args.geometry,
						note_id: args.note_id,
						note: createsNote
							? { title: args.note_title, markdown: args.note_markdown }
							: undefined
					}
				},
				context
			);
			return { data: result.body, target: result.target };
		}
	}),
	defineTool({
		name: 'update_map_feature',
		title: "Change a feature's geometry",
		scope: 'map:write',
		description:
			'Replaces the geometry of a feature. It keeps its kind: a point stays a point, a line a line, a polygon a polygon. Needs the map:write scope.',
		input: z.object({ id: featureId, geometry }),
		audit: 'map_feature.update',
		handler: async (args, context) => {
			const result = await callRoute(
				route('PATCH', '/map/features/{id}'),
				{ params: { id: args.id }, body: { geometry: args.geometry } },
				context
			);
			return { data: result.body, target: result.target };
		}
	}),
	defineTool({
		name: 'delete_map_feature',
		title: 'Delete a map feature',
		scope: 'map:write',
		description:
			'Removes a feature from the map. Its note stays, with any other features it has. Needs the map:write scope.',
		input: z.object({ id: featureId }),
		audit: 'map_feature.delete',
		handler: async (args, context) => {
			const result = await callRoute(
				route('DELETE', '/map/features/{id}'),
				{ params: args },
				context
			);
			return { data: { id: args.id, deleted: true }, target: result.target };
		}
	})
];
