-- API keys. Only a SHA-256 hash of the whole key is stored; the prefix finds the row.
CREATE TABLE api_key (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
	-- Unique, which also serves the lookup by prefix.
	prefix text NOT NULL UNIQUE,
	key_hash text NOT NULL,
	scopes text[] NOT NULL,
	expires_at timestamptz,
	last_used_at timestamptz,
	last_used_ip text,
	revoked_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

-- Settings lists keys newest first.
CREATE INDEX api_key_created_at_idx ON api_key (created_at DESC);
