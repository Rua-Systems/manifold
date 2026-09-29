import type { LineString, Point, Polygon } from 'geojson';
import { z } from 'zod';

/** Geometries with more vertices are refused. */
export const MAX_VERTICES = 10_000;

export type FeatureKind = 'point' | 'line' | 'polygon';

/** The GeoJSON geometry types a map feature may have, always in EPSG:4326. */
export type MapGeometry = Point | LineString | Polygon;

export const KIND_BY_TYPE: Record<MapGeometry['type'], FeatureKind> = {
	Point: 'point',
	LineString: 'line',
	Polygon: 'polygon'
};

export interface MapFeatureView {
	id: string;
	noteId: string;
	noteTitle: string;
	kind: FeatureKind;
	geometry: MapGeometry;
}

const position = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

/**
 * The shape of an accepted geometry: two dimensional positions within longitude and latitude
 * ranges. Validity (closed rings, no self intersections) is checked by PostGIS on the server.
 */
export const mapGeometrySchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('Point'), coordinates: position }),
	z.object({ type: z.literal('LineString'), coordinates: z.array(position).min(2) }),
	z.object({ type: z.literal('Polygon'), coordinates: z.array(z.array(position).min(4)).min(1) })
]);

export function vertexCount(geometry: MapGeometry): number {
	switch (geometry.type) {
		case 'Point':
			return 1;
		case 'LineString':
			return geometry.coordinates.length;
		case 'Polygon':
			return geometry.coordinates.reduce((total, ring) => total + ring.length, 0);
	}
}
