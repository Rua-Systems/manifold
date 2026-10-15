-- Folders for notes, nested like the folders of the Files module. A note sits in one folder or at
-- the top (folder_id null).
CREATE TABLE note_folder (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	-- Only empty folders are deleted, so a folder with folders inside cannot go.
	parent_id uuid REFERENCES note_folder (id) ON DELETE RESTRICT,
	name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now(),
	CONSTRAINT note_folder_not_own_parent CHECK (parent_id <> id)
);

-- One name per place, whatever the case. The top level has no parent, so it gets a fixed key.
CREATE UNIQUE INDEX note_folder_parent_name_unique ON note_folder (
	coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
	lower(name)
);
CREATE INDEX note_folder_parent_id_idx ON note_folder (parent_id);

-- A folder counts as empty when no note outside the trash is in it; deleting it moves the notes
-- in the trash to the top, where restoring them puts them back.
ALTER TABLE note ADD COLUMN folder_id uuid REFERENCES note_folder (id) ON DELETE SET NULL;
CREATE INDEX note_folder_id_idx ON note (folder_id);
