import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// Only `npm run db:studio` uses drizzle-kit. Migrations are hand written SQL in migrations/ and run
// by the app itself, so there is no `out` folder.

// Vite loads `.env` for the app; drizzle-kit needs it loaded by hand.
const ENV_FILE = '.env';

if (existsSync(ENV_FILE)) {
	process.loadEnvFile(ENV_FILE);
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
