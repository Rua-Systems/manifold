-- Prompts of AI Memory: ready instructions that the owner and the agents use again. `body` is plain
-- text in which `{{name}}` marks a place filled in each time the prompt is used. `name` is the
-- prompt's handle, such as `code-review`, which the MCP server offers it under.
CREATE TABLE memory_prompt (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	name text NOT NULL CHECK (
		char_length(name) BETWEEN 1 AND 60 AND name ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
	),
	title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
	description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
	body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 50000),
	-- Prompts share the categories of memories; a category with prompts in it is not empty.
	category_id uuid REFERENCES memory_category (id) ON DELETE RESTRICT,
	version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX memory_prompt_name_unique ON memory_prompt (name);
CREATE INDEX memory_prompt_category_id_idx ON memory_prompt (category_id);
CREATE INDEX memory_prompt_updated_at_idx ON memory_prompt (updated_at DESC);
-- The search finds prompts by title, as for the names of files and data sources.
CREATE INDEX memory_prompt_title_trgm_idx ON memory_prompt USING gin (title gin_trgm_ops);

CREATE TABLE memory_prompt_tag (
	prompt_id uuid NOT NULL REFERENCES memory_prompt (id) ON DELETE CASCADE,
	tag_id uuid NOT NULL REFERENCES tag (id) ON DELETE CASCADE,
	PRIMARY KEY (prompt_id, tag_id)
);

CREATE INDEX memory_prompt_tag_tag_id_idx ON memory_prompt_tag (tag_id);
