-- Extensions used across the app. An external database must allow the connecting role to create them.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Better Auth tables, in the shape Better Auth expects, plus the username plugin columns.
-- Ids are text because Better Auth generates them itself.
CREATE TABLE "user" (
	id text PRIMARY KEY,
	name text NOT NULL,
	email text NOT NULL UNIQUE,
	email_verified boolean NOT NULL DEFAULT false,
	image text,
	username text UNIQUE,
	display_username text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE session (
	id text PRIMARY KEY,
	expires_at timestamptz NOT NULL,
	token text NOT NULL UNIQUE,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	ip_address text,
	user_agent text,
	user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE
);

CREATE INDEX session_user_id_idx ON session (user_id);

CREATE TABLE account (
	id text PRIMARY KEY,
	account_id text NOT NULL,
	provider_id text NOT NULL,
	user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
	access_token text,
	refresh_token text,
	id_token text,
	access_token_expires_at timestamptz,
	refresh_token_expires_at timestamptz,
	scope text,
	password text,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX account_user_id_idx ON account (user_id);

CREATE TABLE verification (
	id text PRIMARY KEY,
	identifier text NOT NULL,
	value text NOT NULL,
	expires_at timestamptz NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX verification_identifier_idx ON verification (identifier);
