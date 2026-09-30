import { TEST_OWNER } from '../support/owner.ts';
import { expect, signIn, test } from './fixtures';

test('other sessions are listed and can all be signed out', async ({ page, browser }) => {
	const elsewhere = await browser.newContext({
		extraHTTPHeaders: { 'X-Forwarded-For': '10.200.0.1' }
	});
	const other = await elsewhere.newPage();
	await signIn(other);
	await signIn(page);

	await page.goto('/settings/security', { waitUntil: 'networkidle' });
	const sessions = page.getByRole('list', { name: 'Sessions' }).getByRole('listitem');
	await expect(sessions.filter({ hasText: 'This session' })).toHaveCount(1);
	expect(await sessions.count()).toBeGreaterThan(1);

	await page.getByRole('button', { name: 'Sign Out All Other Sessions' }).click();
	const stepUp = page.getByRole('dialog', { name: 'Confirm Your Identity' });
	await stepUp.getByLabel('Password', { exact: true }).fill(TEST_OWNER.password);
	await stepUp.getByRole('button', { name: 'Confirm' }).click();
	await expect(page.getByText(/Other sessions signed out: \d+\./)).toBeVisible();
	await expect(sessions).toHaveCount(1);

	await other.goto('/settings');
	await expect(other).toHaveURL(/\/login/);
	await elsewhere.close();
});

test('the audit log shows sign ins and filters by action', async ({ page }) => {
	await page.goto('/login', { waitUntil: 'networkidle' });
	await page.getByLabel('Username or Email').fill(TEST_OWNER.username);
	await page.getByLabel('Password', { exact: true }).fill('wrong password');
	await page.getByRole('button', { name: 'Authenticate' }).click();
	await expect(page.getByText('Those credentials were not accepted.')).toBeVisible();
	await signIn(page);

	await page.goto('/settings/security', { waitUntil: 'networkidle' });
	const log = page.getByRole('table', { name: 'Audit Log' });
	await expect(log.getByText('auth.sign_in', { exact: true }).first()).toBeVisible();
	await expect(log.getByText('auth.sign_in_failed', { exact: true }).first()).toBeVisible();

	await page.getByLabel('Action').fill('auth.sign_in_failed');
	await page.getByRole('button', { name: 'Filter' }).click();
	await expect(page).toHaveURL(/action=auth\.sign_in_failed/);
	const actions = await log.locator('tbody code').allTextContents();
	expect(actions.length).toBeGreaterThan(0);
	expect(new Set(actions)).toEqual(new Set(['auth.sign_in_failed']));
});

test('the default theme applies to browsers without their own choice', async ({ page }) => {
	await signIn(page);
	await page.goto('/settings', { waitUntil: 'networkidle' });
	const preferences = page.locator('form[action="?/preferences"]');
	await preferences.getByLabel('Default theme').selectOption('dark');
	await preferences.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Preferences saved.')).toBeVisible();

	await page.reload();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

	await preferences.getByLabel('Default theme').selectOption('');
	await preferences.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Preferences saved.')).toBeVisible();
});
