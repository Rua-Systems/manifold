-- Fuzzy and substring matches on service aliases and addresses.
CREATE INDEX service_alias_trgm_idx ON service USING GIN (alias gin_trgm_ops);
CREATE INDEX service_url_trgm_idx ON service USING GIN (url gin_trgm_ops);
