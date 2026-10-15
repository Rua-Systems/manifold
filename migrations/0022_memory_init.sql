-- AI Memory module: what the owner's AI agents share, as text the owner can read and change. Like
-- notes, `content` (TipTap JSON) is the source of truth and `content_text` is derived from it on
-- every write for excerpts and search.

-- Categories have exactly two levels: a category, and subcategories inside it. The app keeps a
-- subcategory from getting subcategories of its own.
CREATE TABLE memory_category (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	-- Only empty categories are deleted, so a category with subcategories cannot go.
	parent_id uuid REFERENCES memory_category (id) ON DELETE RESTRICT,
	name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT memory_category_not_own_parent CHECK (parent_id <> id)
);

-- One name per place, whatever the case. The top level has no parent, so it gets a fixed key.
CREATE UNIQUE INDEX memory_category_parent_name_unique ON memory_category (
	coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
	lower(name)
);
CREATE INDEX memory_category_parent_id_idx ON memory_category (parent_id);

CREATE TABLE memory (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
	content jsonb NOT NULL,
	content_text text NOT NULL DEFAULT '',
	-- A category counts as empty when no memory outside the trash is in it; deleting it leaves the
	-- memories in the trash without a category.
	category_id uuid REFERENCES memory_category (id) ON DELETE SET NULL,
	-- Pinned memories are what an agent reads first, at the start of its work.
	pinned boolean NOT NULL DEFAULT false,
	version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
	deleted_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	-- The same search as notes: `simple` neither stems nor drops stop words, for mixed languages.
	search_vector tsvector GENERATED ALWAYS AS (
		setweight(to_tsvector('simple', title), 'A') ||
		setweight(to_tsvector('simple', left(content_text, 200000)), 'B')
	) STORED
);

CREATE INDEX memory_updated_at_idx ON memory (updated_at DESC);
CREATE INDEX memory_deleted_at_idx ON memory (deleted_at);
CREATE INDEX memory_category_id_idx ON memory (category_id);
CREATE INDEX memory_pinned_idx ON memory (pinned) WHERE pinned;
CREATE INDEX memory_search_vector_idx ON memory USING GIN (search_vector);
CREATE INDEX memory_title_trgm_idx ON memory USING GIN (title gin_trgm_ops);

-- Every state a memory had, with who wrote it: the owner, or which API key.
CREATE TABLE memory_revision (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	memory_id uuid NOT NULL REFERENCES memory (id) ON DELETE CASCADE,
	version integer NOT NULL,
	title text NOT NULL,
	content jsonb NOT NULL,
	actor_type text NOT NULL CHECK (actor_type IN ('owner', 'api_key', 'system')),
	actor_id text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	-- Also serves lookups by memory_id, the foreign key, and the ordering by version.
	CONSTRAINT memory_revision_memory_version_unique UNIQUE (memory_id, version)
);

CREATE TABLE memory_tag (
	memory_id uuid NOT NULL REFERENCES memory (id) ON DELETE CASCADE,
	tag_id uuid NOT NULL REFERENCES tag (id) ON DELETE CASCADE,
	PRIMARY KEY (memory_id, tag_id)
);

CREATE INDEX memory_tag_tag_id_idx ON memory_tag (tag_id);

-- API keys limited to some categories: such a key reads and writes only the memories in them and
-- in their subcategories. A key without rows here reaches every memory. A category a key is
-- limited to cannot be deleted, so deleting it can never widen what the key reaches.
CREATE TABLE memory_key_category (
	api_key_id uuid NOT NULL REFERENCES api_key (id) ON DELETE CASCADE,
	category_id uuid NOT NULL REFERENCES memory_category (id) ON DELETE RESTRICT,
	PRIMARY KEY (api_key_id, category_id)
);

CREATE INDEX memory_key_category_category_id_idx ON memory_key_category (category_id);
