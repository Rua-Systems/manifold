import { defineConfig } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
	testDir: 'tests/e2e',
	use: {
		baseURL: `http://localhost:${PORT}`
	},
	webServer: {
		command: 'npm run build && npm run preview',
		port: PORT,
		// The e2e flows never sign in, so these placeholders only have to let the server start.
		// The database address points nowhere on purpose: tests must never touch a real database.
		env: {
			ORIGIN: `http://localhost:${PORT}`,
			DATABASE_URL: 'postgres://e2e:e2e@127.0.0.1:1/manifold_e2e',
			BETTER_AUTH_SECRET: 'e2e-only-secret-that-is-long-enough-to-pass',
			OWNER_EMAIL: 'owner@example.test'
		}
	}
});
