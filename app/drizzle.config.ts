import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// Only `npm run db:studio` uses drizzle-kit. Migrations are hand written SQL in migrations/ and run
// by the app itself, so there is no `out` folder.

// The app reads `.env` from the repository root (see `env.dir` in vite.config.ts); drizzle-kit
// only looks in the working directory, so point it there too.
const ROOT_ENV_FILE = '../.env';

if (existsSync(ROOT_ENV_FILE)) {
	process.loadEnvFile(ROOT_ENV_FILE);
}

if (!process.env.DATABASE_URL) {
	throw new Error('DATABASE_URL is not set');
}

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	dialect: 'postgresql',
	dbCredentials: { url: process.env.DATABASE_URL },
	strict: true
});
