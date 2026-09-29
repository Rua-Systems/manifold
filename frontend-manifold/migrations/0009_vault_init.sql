-- Vault module. Values are encrypted with AES-256-GCM under ENCRYPTION_KEY, with a random IV per
-- value and the row id as additional authenticated data, so a value cannot be moved to another row.
CREATE TABLE vault_secret (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
	service_url text,
	description text CHECK (char_length(description) <= 500),
	ciphertext bytea NOT NULL,
	iv bytea NOT NULL CHECK (octet_length(iv) = 12),
	auth_tag bytea NOT NULL CHECK (octet_length(auth_tag) = 16),
	-- Which ENCRYPTION_KEY sealed the value; the rotation command raises it.
	key_version integer NOT NULL DEFAULT 1 CHECK (key_version >= 1),
	last_revealed_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

-- The vault page lists secrets by name.
CREATE INDEX vault_secret_name_idx ON vault_secret (lower(name));
