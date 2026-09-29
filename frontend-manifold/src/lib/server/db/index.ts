import { building } from '$app/environment';
import { env } from '$env/dynamic/private';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// `vite build` imports every server module to analyse routes, and the Docker build stage has no
// database. postgres.js only connects on the first query, so the client is safe to create there.
if (!building && !env.DATABASE_URL) {
	throw new Error('DATABASE_URL is not set');
}

const client = postgres(env.DATABASE_URL ?? '');

export const db = drizzle(client, { schema });
