-- Files module. Folders hold the files uploaded on the Files page; a file of another module, such as
-- a note image or a service icon, is listed by the module that keeps it instead.
CREATE TABLE file_folder (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	-- No parent: the folder sits at the top. A folder with something in it cannot be deleted.
	parent_id uuid REFERENCES file_folder (id) ON DELETE RESTRICT,
	name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CHECK (parent_id IS NULL OR parent_id <> id)
);

-- Names are unique within their folder, whatever their case.
CREATE UNIQUE INDEX file_folder_name_unique ON file_folder (
	coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
	lower(name)
);
CREATE INDEX file_folder_parent_idx ON file_folder (parent_id);

-- A file kept by the Files module: it stays until it is deleted there, so housekeeping counts this
-- as a reference. No folder: the file sits at the top.
CREATE TABLE file_entry (
	file_id uuid PRIMARY KEY REFERENCES file (id) ON DELETE CASCADE,
	folder_id uuid REFERENCES file_folder (id) ON DELETE RESTRICT,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX file_entry_folder_idx ON file_entry (folder_id);

-- The search and the filter of the Files page find files by name.
CREATE INDEX file_original_name_trgm_idx ON file USING GIN (original_name gin_trgm_ops);
