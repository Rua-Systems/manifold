import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import postgres from 'postgres';

// Runs under Node's type stripping (Playwright's web server command) as well as Vitest, so it may
// only use relative imports and packages.

export const TEST_DATABASE = 'manifold_test';

const ROOT_ENV_FILE = new URL('../../.env', import.meta.url);

/**
 * The manifold_test database of the dev compose service on 127.0.0.1. It is built from the
 * POSTGRES_* credentials and never from DATABASE_URL, so tests cannot reach the development
 * database or a remote one.
 */
export function testDatabaseUrl(): string {
	let variables: Record<string, string | undefined> = {};
	if (existsSync(ROOT_ENV_FILE)) {
		variables = parseEnv(readFileSync(ROOT_ENV_FILE, 'utf8'));
	}

	const user = process.env.POSTGRES_USER ?? variables.POSTGRES_USER;
	const password = process.env.POSTGRES_PASSWORD ?? variables.POSTGRES_PASSWORD;
	if (!user || !password) {
		throw new Error(
			'POSTGRES_USER and POSTGRES_PASSWORD must be set in the root .env; the tests use the ' +
				'dev compose database (`npm run db:up`).'
		);
	}
	return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:5432/${TEST_DATABASE}`;
}

/** Drops every table, extension and isolated test schema, leaving an empty public schema. */
export async function resetTestDatabase(url: string): Promise<void> {
	const sql = postgres(url, { max: 1, onnotice: () => {} });
	try {
		const [{ name }] = await sql<{ name: string }[]>`select current_database() as name`;
		if (name !== TEST_DATABASE) {
			throw new Error(`Refusing to reset "${name}"; only ${TEST_DATABASE} may be reset.`);
		}

		const schemas = await sql<{ name: string }[]>`
			select nspname as name from pg_namespace where nspname like 'test\_%'
		`;
		for (const schema of schemas) {
			await sql.unsafe(`drop schema "${schema.name}" cascade`);
		}
		await sql.unsafe('drop schema if exists public cascade');
		await sql.unsafe('create schema public');
	} finally {
		await sql.end();
	}
}
