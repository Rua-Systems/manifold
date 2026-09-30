import { resetTestDatabase, testDatabaseUrl } from '../support/test-database.ts';

// Part of the Playwright web server command: the app starts on an empty manifold_test and migrates
// it itself, exactly like a first start in production.
await resetTestDatabase(testDatabaseUrl());
