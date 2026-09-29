-- Integration and end-to-end tests reset and migrate this database on every run, so they never
-- touch the development database.
CREATE DATABASE manifold_test;
