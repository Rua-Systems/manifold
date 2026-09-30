import { connect, type Connection } from '$lib/server/db';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { inject } from 'vitest';

/**
 * Runs `test` against a fresh schema of its own inside manifold_test, so it can create tables and
 * rows without touching the shared seeded schema. `public` stays on the search path for extensions.
 */
export interface IsolatedSchema {
	url: string;
	searchPath: string;
}

export async function withIsolatedSchema<T>(
	test: (connection: Connection, schema: IsolatedSchema) => Promise<T>
): Promise<T> {
	const url = inject('databaseUrl');
	const schema = `test_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
	const searchPath = `"${schema}", public`;
	const admin = postgres(url, { max: 1, onnotice: () => {} });
	await admin.unsafe(`create schema "${schema}"`);

	const connection = connect(url, { searchPath, max: 4 });
	try {
		return await test(connection, { url, searchPath });
	} finally {
		await connection.sql.end();
		await admin.unsafe(`drop schema "${schema}" cascade`);
		await admin.end();
	}
}
