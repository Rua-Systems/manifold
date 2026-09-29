-- Two factor authentication, in the shape Better Auth's twoFactor plugin expects.
ALTER TABLE "user" ADD COLUMN two_factor_enabled boolean DEFAULT false;

CREATE TABLE two_factor (
	id text PRIMARY KEY,
	-- Encrypted by Better Auth with BETTER_AUTH_SECRET.
	secret text NOT NULL,
	backup_codes text NOT NULL,
	user_id text NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
	verified boolean DEFAULT true,
	failed_verification_count integer DEFAULT 0,
	locked_until timestamptz
);

CREATE INDEX two_factor_secret_idx ON two_factor (secret);
CREATE INDEX two_factor_user_id_idx ON two_factor (user_id);

-- When the owner last re-entered their credentials in a session; sensitive actions need it to be
-- recent. Rows go with their session.
CREATE TABLE session_step_up (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	-- Unique, which also indexes the foreign key.
	session_id text NOT NULL UNIQUE REFERENCES session (id) ON DELETE CASCADE,
	stepped_up_at timestamptz NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

-- Security events and writes from outside the browser. Never holds secrets.
CREATE TABLE audit_event (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	occurred_at timestamptz NOT NULL DEFAULT now(),
	actor_type text NOT NULL CHECK (actor_type IN ('owner', 'api_key', 'cli', 'system')),
	actor_id text,
	action text NOT NULL,
	target_type text,
	target_id text,
	ip text,
	user_agent text,
	metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_event_occurred_at_idx ON audit_event (occurred_at DESC);
CREATE INDEX audit_event_actor_idx ON audit_event (actor_type, actor_id);
-- The log filters by action prefix (`auth.` and so on).
CREATE INDEX audit_event_action_idx ON audit_event (action text_pattern_ops);

-- The owner's preferences. Null means "not chosen": the request's locale, the browser's theme.
CREATE TABLE user_setting (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id text NOT NULL UNIQUE REFERENCES "user" (id) ON DELETE CASCADE,
	locale text CHECK (locale IN ('en', 'tr')),
	theme text CHECK (theme IN ('light', 'dark')),
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);
