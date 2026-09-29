import postgres from 'postgres';
import { testDatabaseUrl } from '../support/test-database.ts';

/** Runs `work` against manifold_test, for setting up and cleaning up state the UI cannot reach. */
export async function withDatabase<T>(work: (sql: postgres.Sql) => Promise<T>): Promise<T> {
	const sql = postgres(testDatabaseUrl(), { max: 1, onnotice: () => {} });
	try {
		return await work(sql);
	} finally {
		await sql.end();
	}
}
