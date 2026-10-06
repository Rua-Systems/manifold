-- A vault entry can be the copy of an API key, saved when the owner asks for one while creating the
-- key. Revoking the key deletes its copy; each key has at most one.
ALTER TABLE vault_secret
	ADD COLUMN api_key_id uuid UNIQUE REFERENCES api_key (id) ON DELETE CASCADE;
