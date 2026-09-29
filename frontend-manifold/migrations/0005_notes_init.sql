-- Notes module. `content` (TipTap JSON) is the source of truth; `content_text` is derived from it on
-- every write for excerpts and search.
CREATE TABLE note (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	title text NOT NULL DEFAULT '' CHECK (char_length(title) <= 200),
	content jsonb NOT NULL,
	content_text text NOT NULL DEFAULT '',
	version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
	deleted_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

-- Lists order by the last update; the trash and its purge filter on deleted_at.
CREATE INDEX note_updated_at_idx ON note (updated_at DESC);
CREATE INDEX note_deleted_at_idx ON note (deleted_at);

CREATE TABLE note_revision (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	note_id uuid NOT NULL REFERENCES note (id) ON DELETE CASCADE,
	version integer NOT NULL,
	title text NOT NULL,
	content jsonb NOT NULL,
	actor_type text NOT NULL CHECK (actor_type IN ('owner', 'api_key', 'system')),
	actor_id text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	-- Also serves lookups by note_id, the foreign key, and the ordering by version.
	CONSTRAINT note_revision_note_version_unique UNIQUE (note_id, version)
);

-- Files a note's content points to, kept in step with the content on every write.
CREATE TABLE note_file (
	note_id uuid NOT NULL REFERENCES note (id) ON DELETE CASCADE,
	file_id uuid NOT NULL REFERENCES file (id) ON DELETE CASCADE,
	PRIMARY KEY (note_id, file_id)
);

CREATE INDEX note_file_file_id_idx ON note_file (file_id);
