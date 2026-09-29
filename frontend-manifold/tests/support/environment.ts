import { TEST_OWNER_VARIABLES } from './owner.ts';

export const TEST_ORGANIZATION_NAME = 'E2E Org';

/** Environment for the app under test: fixed test secrets, no SMTP, uploads inside the project. */
export function testEnvironment(databaseUrl: string, origin: string): Record<string, string> {
	return {
		ORIGIN: origin,
		ORGANIZATION_NAME: TEST_ORGANIZATION_NAME,
		DATABASE_URL: databaseUrl,
		BETTER_AUTH_SECRET: 'test-only-secret-that-is-at-least-32-characters',
		ENCRYPTION_KEY: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=',
		...TEST_OWNER_VARIABLES,
		SMTP_HOST: '',
		SMTP_USER: '',
		SMTP_PASSWORD: '',
		MAIL_FROM: '',
		UPLOAD_DIR: './.data/test-uploads'
	};
}
