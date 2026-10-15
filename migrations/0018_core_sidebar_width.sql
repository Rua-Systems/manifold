-- The width the owner dragged the sidebar to, in CSS pixels. Null keeps the default width. Kept with
-- the other preferences rather than in a cookie, so every browser opens the sidebar the same way.
ALTER TABLE user_setting ADD COLUMN sidebar_width integer
	CHECK (sidebar_width BETWEEN 200 AND 500);
