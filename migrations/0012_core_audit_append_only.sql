-- The audit log is append-only: events are never changed, and only the retention task removes
-- them, inside a transaction that sets manifold.audit_purge. Anything else that tries to update,
-- delete or truncate them fails.

CREATE FUNCTION audit_event_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'UPDATE' THEN
		RAISE EXCEPTION 'Audit events cannot be changed.';
	END IF;
	IF current_setting('manifold.audit_purge', true) IS DISTINCT FROM 'on' THEN
		RAISE EXCEPTION 'Audit events are removed only by the retention task.';
	END IF;
	IF TG_OP = 'DELETE' THEN
		RETURN OLD;
	END IF;
	RETURN NULL;
END;
$$;

CREATE TRIGGER audit_event_no_change
	BEFORE UPDATE OR DELETE ON audit_event
	FOR EACH ROW EXECUTE FUNCTION audit_event_guard();

CREATE TRIGGER audit_event_no_truncate
	BEFORE TRUNCATE ON audit_event
	FOR EACH STATEMENT EXECUTE FUNCTION audit_event_guard();
