-- Full text search over notes. The `simple` configuration neither stems nor drops stop words, which
-- suits notes that mix Turkish and English. The text is capped because a tsvector has a size limit.
ALTER TABLE note ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
	setweight(to_tsvector('simple', title), 'A') ||
	setweight(to_tsvector('simple', left(content_text, 200000)), 'B')
) STORED;

CREATE INDEX note_search_vector_idx ON note USING GIN (search_vector);

-- Fuzzy and substring matches on titles.
CREATE INDEX note_title_trgm_idx ON note USING GIN (title gin_trgm_ops);
