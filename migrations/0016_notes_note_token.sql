-- Access tokens for a single note: a share link that opens the note without signing in, and a
-- Bearer key that reaches that note alone. Only a SHA-256 hash of the token is stored; the prefix
-- finds the row. Every token expires; deleting the note deletes its tokens.
CREATE TABLE note_token (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	note_id uuid NOT NULL REFERENCES note (id) ON DELETE CASCADE,
	name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
	access text NOT NULL CHECK (access IN ('read', 'edit')),
	prefix text NOT NULL UNIQUE,
	token_hash text NOT NULL,
	expires_at timestamptz NOT NULL,
	last_used_at timestamptz,
	last_used_ip text,
	revoked_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

-- The note page lists the tokens of one note, Settings all of them, newest first.
CREATE INDEX note_token_note_id_idx ON note_token (note_id);
CREATE INDEX note_token_created_at_idx ON note_token (created_at DESC);

-- Revisions written through a token name it as their actor.
ALTER TABLE note_revision DROP CONSTRAINT note_revision_actor_type_check;
ALTER TABLE note_revision ADD CONSTRAINT note_revision_actor_type_check
	CHECK (actor_type IN ('owner', 'api_key', 'note_token', 'system'));
