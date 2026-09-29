import { m } from '$lib/paraglide/messages.js';
import type { Actor } from '$lib/server/actor';
import { getDb } from '$lib/server/db';
import { getEnv } from '$lib/server/env';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { isUuid } from '$lib/utils/uuid';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { getNote, insertNote } from '../notes.server';
import { mapFeature, note } from '../schema.server';
import type { MapConfig } from './config';
import {
	KIND_BY_TYPE,
	mapGeometrySchema,
	MAX_VERTICES,
	vertexCount,
	type FeatureKind,
	type MapFeatureView,
	type MapGeometry
} from './geometry';

// Map features: geometries linked to notes. A trashed note hides its features.

/** Seven decimals of a degree are about a centimetre. */
const GEOJSON_DECIMALS = 7;

const featureColumns = {
	id: mapFeature.id,
	noteId: mapFeature.noteId,
	noteTitle: note.title,
	kind: mapFeature.kind,
	geometry: sql<MapGeometry>`ST_AsGeoJSON(${mapFeature.geometry}, ${sql.raw(String(GEOJSON_DECIMALS))})::json`
};

export function mapConfig(): MapConfig {
	const env = getEnv();
	return {
		tileUrl: env.MAP_TILE_URL,
		attribution: env.MAP_TILE_ATTRIBUTION,
		center: env.MAP_DEFAULT_CENTER,
		zoom: env.MAP_DEFAULT_ZOOM
	};
}

function invalidGeometry(message: string): ValidationError {
	return new ValidationError({ geometry: message });
}

/** PostGIS's validity rules; input it cannot even parse counts as invalid. */
async function isValidInPostgis(geometry: MapGeometry): Promise<boolean> {
	try {
		const [row] = await getDb().execute<{ valid: boolean }>(
			sql`select ST_IsValid(g, 0) as valid from (select ST_GeomFromGeoJSON(${JSON.stringify(geometry)}::text) as g) as parsed`
		);
		return row?.valid === true;
	} catch {
		return false;
	}
}

/**
 * Checks a GeoJSON geometry: Point, LineString or Polygon, at most MAX_VERTICES vertices, and
 * valid by PostGIS's rules (closed rings, no self intersections). Runs outside any transaction,
 * since PostGIS raises an error, not `false`, on input it cannot parse.
 */
export async function validateGeometry(
	input: unknown
): Promise<{ geometry: MapGeometry; kind: FeatureKind }> {
	const type = typeof input === 'object' && input !== null ? Reflect.get(input, 'type') : null;
	if (typeof type !== 'string' || !Object.hasOwn(KIND_BY_TYPE, type)) {
		throw invalidGeometry(m.map_error_geometry_type());
	}
	const parsed = mapGeometrySchema.safeParse(input);
	if (!parsed.success) {
		throw invalidGeometry(m.map_error_geometry_invalid());
	}
	const geometry = parsed.data;
	if (vertexCount(geometry) > MAX_VERTICES) {
		throw invalidGeometry(m.map_error_too_many_vertices({ max: MAX_VERTICES }));
	}

	if (!(await isValidInPostgis(geometry))) {
		throw invalidGeometry(m.map_error_geometry_invalid());
	}
	return { geometry, kind: KIND_BY_TYPE[geometry.type] };
}

/** Every feature whose note is not in the trash, oldest first. */
export async function listMapFeatures(): Promise<MapFeatureView[]> {
	return getDb()
		.select(featureColumns)
		.from(mapFeature)
		.innerJoin(note, eq(note.id, mapFeature.noteId))
		.where(isNull(note.deletedAt))
		.orderBy(asc(mapFeature.createdAt));
}

export async function listNoteFeatures(noteId: string): Promise<MapFeatureView[]> {
	if (!isUuid(noteId)) {
		return [];
	}
	return getDb()
		.select(featureColumns)
		.from(mapFeature)
		.innerJoin(note, eq(note.id, mapFeature.noteId))
		.where(and(eq(mapFeature.noteId, noteId), isNull(note.deletedAt)))
		.orderBy(asc(mapFeature.createdAt));
}

export async function getMapFeature(id: string): Promise<MapFeatureView> {
	if (!isUuid(id)) {
		throw new NotFoundError('Map feature');
	}
	const [row] = await getDb()
		.select(featureColumns)
		.from(mapFeature)
		.innerJoin(note, eq(note.id, mapFeature.noteId))
		.where(and(eq(mapFeature.id, id), isNull(note.deletedAt)))
		.limit(1);
	if (row === undefined) {
		throw new NotFoundError('Map feature');
	}
	return row;
}

/** Links a new geometry to an existing note that is not in the trash. */
export async function addFeature(noteId: string, input: unknown): Promise<MapFeatureView> {
	const { geometry, kind } = await validateGeometry(input);
	const target = await getNote(noteId);
	const [created] = await getDb()
		.insert(mapFeature)
		.values({ noteId: target.id, geometry, kind })
		.returning({ id: mapFeature.id });
	return getMapFeature(created.id);
}

/** Creates an untitled note and links the geometry to it, in one transaction. */
export async function addFeatureWithNewNote(input: unknown, actor: Actor): Promise<MapFeatureView> {
	const { geometry, kind } = await validateGeometry(input);
	const id = await getDb().transaction(async (tx) => {
		const noteId = await insertNote(tx, {}, actor);
		const [created] = await tx
			.insert(mapFeature)
			.values({ noteId, geometry, kind })
			.returning({ id: mapFeature.id });
		return created.id;
	});
	return getMapFeature(id);
}

/** Replaces a feature's geometry, for example after its vertices were moved. */
export async function updateFeatureGeometry(
	id: string,
	input: unknown,
	now = new Date()
): Promise<MapFeatureView> {
	const current = await getMapFeature(id);
	const { geometry, kind } = await validateGeometry(input);
	if (kind !== current.kind) {
		throw invalidGeometry(m.map_error_geometry_type());
	}
	await getDb()
		.update(mapFeature)
		.set({ geometry, updatedAt: now })
		.where(eq(mapFeature.id, current.id));
	return getMapFeature(current.id);
}

/** Deletes a geometry. Its note stays. */
export async function deleteFeature(id: string): Promise<void> {
	const current = await getMapFeature(id);
	await getDb().delete(mapFeature).where(eq(mapFeature.id, current.id));
}
