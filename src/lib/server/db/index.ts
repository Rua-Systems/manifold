import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { getEnv } from '../env';
import * as schema from './schema';

export type Database = PostgresJsDatabase<typeof schema>;

export interface Connection {
	sql: Sql;
	db: Database;
}

export interface ConnectOptions {
	/** Extra schemas to search before `public`, used by tests to isolate their tables. */
	searchPath?: string;
	max?: number;
}

export function connect(url: string, options: ConnectOptions = {}): Connection {
	const connection: Record<string, string> = {};
	if (options.searchPath !== undefined) {
		connection.search_path = options.searchPath;
	}

	const sql = postgres(url, {
		max: options.max ?? 10,
		connection,
		// Notices such as "extension already exists, skipping" are expected and only add noise.
		onnotice: () => {}
	});
	return { sql, db: drizzle(sql, { schema }) };
}

// One pool shared by every request; it carries no per-user data.
let shared: Connection | undefined;

export function getConnection(): Connection {
	if (shared === undefined) {
		shared = connect(getEnv().DATABASE_URL);
	}
	return shared;
}

export function getDb(): Database {
	return getConnection().db;
}

export function getSql(): Sql {
	return getConnection().sql;
}
