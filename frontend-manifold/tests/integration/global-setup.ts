import { connect } from '$lib/server/db';
import { defaultMigrationsDirectory, runMigrations } from '$lib/server/db/migrate';
import { bootstrapOwner } from '$lib/server/owner';
import type { TestProject } from 'vitest/node';
import { TEST_OWNER_VARIABLES } from '../support/owner.ts';
import { resetTestDatabase, testDatabaseUrl } from '../support/test-database.ts';

const silent = { info: () => {} };

/** Every run starts from an empty manifold_test, migrated and seeded with the test owner. */
export default async function setup(project: TestProject): Promise<void> {
	const url = testDatabaseUrl();
	await resetTestDatabase(url);

	const connection = connect(url, { max: 2 });
	try {
		await runMigrations(connection.sql, defaultMigrationsDirectory());
		await bootstrapOwner(connection.db, TEST_OWNER_VARIABLES, silent);
	} finally {
		await connection.sql.end();
	}
	project.provide('databaseUrl', url);
}

declare module 'vitest' {
	export interface ProvidedContext {
		databaseUrl: string;
	}
}
