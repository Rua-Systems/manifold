-- Basemaps the owner added for the map, in the owner's order. The tile source of MAP_TILE_URL is
-- configuration, not stored here, and the map shows it while no basemap is in use.
CREATE TABLE map_basemap (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
	-- An XYZ template such as https://tiles.example.com/{z}/{x}/{y}.png; the page's content security
	-- policy only lets images load over https.
	url text NOT NULL CHECK (url ~ '^https://' AND char_length(url) <= 2048),
	-- Plain text; the map escapes it before showing it.
	attribution text NOT NULL DEFAULT '' CHECK (char_length(attribution) <= 300),
	max_zoom integer NOT NULL DEFAULT 19 CHECK (max_zoom BETWEEN 0 AND 22),
	in_use boolean NOT NULL DEFAULT false,
	position integer NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX map_basemap_position_idx ON map_basemap (position);

-- At most one basemap is in use at a time.
CREATE UNIQUE INDEX map_basemap_in_use_idx ON map_basemap (in_use) WHERE in_use;
