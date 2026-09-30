-- Browsers the owner has signed in from, so a sign in from a new one can trigger a notice mail.
-- Only a SHA-256 hash of the user agent is kept.
CREATE TABLE known_user_agent (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
	user_agent_hash text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	-- Also serves lookups by user_id, the foreign key.
	CONSTRAINT known_user_agent_user_agent_unique UNIQUE (user_id, user_agent_hash)
);
