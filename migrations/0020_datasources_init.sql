-- Data Sources module: how to reach the owner's databases, APIs, links and buckets. The fields
-- without secrets sit in `settings`, shaped by the type and checked by the app. Passwords, tokens
-- and keys sit together as one JSON object, sealed with AES-256-GCM under ENCRYPTION_KEY like vault
-- values: a random IV, and the row id as additional authenticated data.
CREATE TABLE data_source (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
	type text NOT NULL CHECK (type IN ('postgresql', 'mysql', 'redis', 's3', 'api', 'link')),
	settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
	description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 5000),
	docs_url text CHECK (char_length(docs_url) <= 2000),
	ciphertext bytea NOT NULL,
	iv bytea NOT NULL CHECK (octet_length(iv) = 12),
	auth_tag bytea NOT NULL CHECK (octet_length(auth_tag) = 16),
	-- Which ENCRYPTION_KEY sealed the secrets; the rotation command raises it.
	key_version integer NOT NULL DEFAULT 1 CHECK (key_version >= 1),
	-- The last connection test: when, whether it worked, and what it found or why it failed.
	tested_at timestamptz,
	test_ok boolean,
	test_message text CHECK (char_length(test_message) <= 1000),
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

-- One name per source whatever its case; the page lists them by name.
CREATE UNIQUE INDEX data_source_name_unique ON data_source (lower(name));
CREATE INDEX data_source_type_idx ON data_source (type);
-- The search finds sources by name, as for vault entries and file names.
CREATE INDEX data_source_name_trgm_idx ON data_source USING gin (name gin_trgm_ops);
