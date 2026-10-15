-- Global tags, kept by the owner in Settings → Tags. Modules attach them to their records through
-- tables of their own, so deleting a tag takes it off everything that carried it.
CREATE TABLE tag (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
	color text NOT NULL DEFAULT 'gray' CHECK (
		color IN ('gray', 'green', 'teal', 'blue', 'violet', 'rose', 'amber', 'red')
	),
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

-- One tag per name whatever its case, so agents can name tags without knowing their ids.
CREATE UNIQUE INDEX tag_name_unique ON tag (lower(name));
