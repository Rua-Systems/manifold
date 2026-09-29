-- Uploaded files. The bytes live under UPLOAD_DIR as storage_key; nothing here is a user supplied path.
CREATE TABLE file (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	storage_key text NOT NULL UNIQUE,
	original_name text NOT NULL,
	mime_type text NOT NULL,
	size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
	sha256 text NOT NULL,
	owner_module text NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

-- The housekeeping job looks for old files nothing references.
CREATE INDEX file_created_at_idx ON file (created_at);
