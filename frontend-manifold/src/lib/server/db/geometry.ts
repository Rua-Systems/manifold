import { sql } from 'drizzle-orm';
import { customType } from 'drizzle-orm/pg-core';
import type { Geometry } from 'geojson';

/**
 * A PostGIS `geometry(Geometry, 4326)` column written from GeoJSON. Drizzle's own `geometry()`
 * only handles points, so this custom type is used instead. The driver returns hex EWKB for the
 * raw column, so reads select `ST_AsGeoJSON(column)::json` rather than the column itself.
 */
export const geometry4326 = customType<{ data: Geometry; driverData: string }>({
	// Lower case: drizzle-kit quotes type names it does not recognise, and it compares case.
	dataType: () => 'geometry(Geometry, 4326)',
	toDriver: (value) => sql`ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(value)}::text), 4326)`
});
