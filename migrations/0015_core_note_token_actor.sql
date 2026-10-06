-- Writes made with a note token (0016) are recorded under their own kind of actor.
ALTER TABLE audit_event DROP CONSTRAINT audit_event_actor_type_check;
ALTER TABLE audit_event ADD CONSTRAINT audit_event_actor_type_check
	CHECK (actor_type IN ('owner', 'api_key', 'note_token', 'cli', 'system'));
