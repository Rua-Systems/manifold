-- Services module: links to the services this instance keeps track of, in the owner's order.
CREATE TABLE service (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	alias text NOT NULL CHECK (char_length(alias) BETWEEN 1 AND 60),
	url text NOT NULL CHECK (url ~* '^https?://'),
	icon_file_id uuid REFERENCES file (id) ON DELETE SET NULL,
	position integer NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX service_icon_file_id_idx ON service (icon_file_id);
CREATE INDEX service_position_idx ON service (position);
