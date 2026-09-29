import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

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
	out: './drizzle',
	dialect: 'postgresql',
	dbCredentials: { url: process.env.DATABASE_URL },
	verbose: true,
	strict: true
});
