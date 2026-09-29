import { expect, test as base, type Page } from '@playwright/test';
import { randomInt } from 'node:crypto';
import { TEST_OWNER } from '../support/owner.ts';

/**
 * A random client address per test, so rate limits never leak from one test into the next. A
 * counter would restart whenever Playwright replaces a failed worker and hand out old addresses.
 */
function randomAddress(): string {
	const value = randomInt(0, 2 ** 24);
	return `10.${(value >> 16) & 255}.${(value >> 8) & 255}.${value & 255}`;
}

export const test = base.extend<{ clientAddress: string }>({
	// Playwright reads fixture dependencies from the destructured first argument, so it must stay
	// an object pattern even when empty.
	// eslint-disable-next-line no-empty-pattern
	clientAddress: async ({}, use) => {
		await use(randomAddress());
	},
	extraHTTPHeaders: async ({ clientAddress }, use) => {
		await use({ 'X-Forwarded-For': clientAddress });
	}
});

export { expect };

/** Signs the test owner in through the login form and waits for the landing page. */
export async function signIn(
	page: Page,
	identifier: string = TEST_OWNER.username,
	password: string = TEST_OWNER.password
): Promise<void> {
	await page.goto('/login', { waitUntil: 'networkidle' });
	await page.getByLabel('Username or Email').fill(identifier);
	await page.getByLabel('Password', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Authenticate' }).click();
	await page.waitForURL(/\/services$/);
}
