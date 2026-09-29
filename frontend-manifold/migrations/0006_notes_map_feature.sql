-- Map Notes: geometries drawn on the map, each linked to exactly one note. Stored in EPSG:4326.
CREATE TABLE map_feature (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	note_id uuid NOT NULL REFERENCES note (id) ON DELETE CASCADE,
	geometry geometry(Geometry, 4326) NOT NULL,
	kind text NOT NULL CHECK (kind IN ('point', 'line', 'polygon')),
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	-- The server validates before writing; these keep the rules true for any other writer.
	CONSTRAINT map_feature_kind_matches_geometry CHECK (
		kind = CASE GeometryType(geometry)
			WHEN 'POINT' THEN 'point'
			WHEN 'LINESTRING' THEN 'line'
			WHEN 'POLYGON' THEN 'polygon'
		END
	),
	CONSTRAINT map_feature_geometry_valid CHECK (ST_IsValid(geometry)),
	CONSTRAINT map_feature_vertex_limit CHECK (ST_NPoints(geometry) <= 10000)
);

CREATE INDEX map_feature_geometry_idx ON map_feature USING GIST (geometry);
CREATE INDEX map_feature_note_id_idx ON map_feature (note_id);
