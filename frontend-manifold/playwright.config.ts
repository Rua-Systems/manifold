import { defineConfig, devices } from '@playwright/test';
import { testEnvironment } from './tests/support/environment.ts';
import { testDatabaseUrl } from './tests/support/test-database.ts';

const PORT = 4173;
const ORIGIN = `http://localhost:${PORT}`;

export default defineConfig({
	testDir: 'tests/e2e',
	// One shared database and one owner account: tests run one after another.
	workers: 1,
	fullyParallel: false,
	use: {
		baseURL: ORIGIN
	},
	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] } },
		{ name: 'mobile', use: { ...devices['Pixel 7'] } }
	],
	webServer: {
		// The production server (adapter-node) against a freshly reset manifold_test. It migrates and
		// creates the test owner on start, like a real first start.
		command: 'npm run build && node tests/e2e/reset-database.ts && node build',
		port: PORT,
		timeout: 240_000,
		env: {
			...testEnvironment(testDatabaseUrl(), ORIGIN),
			NODE_ENV: 'production',
			PORT: String(PORT),
			// Every test sends its own X-Forwarded-For address, so the sign in rate limiter counts
			// each test separately, as it would count separate visitors.
			ADDRESS_HEADER: 'x-forwarded-for',
			XFF_DEPTH: '1'
		}
	}
});
