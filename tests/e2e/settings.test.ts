import type { Page } from '@playwright/test';
import { TEST_OWNER } from '../support/owner.ts';
import { expect, signIn, test } from './fixtures';

/** Password changes need a recent step-up; the step-up page gives one and returns to Settings. */
async function stepUp(page: Page, password: string): Promise<void> {
	await page.goto('/step-up?redirectTo=/settings', { waitUntil: 'networkidle' });
	await page.getByLabel('Password', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Confirm' }).click();
	await page.waitForURL(/\/settings$/);
}

test('the display name can be changed', async ({ page }) => {
	await signIn(page);
	await page.goto('/settings', { waitUntil: 'networkidle' });

	const name = `Keeper ${Date.now()}`;
	await page.getByLabel('Display Name').fill(name);
	await page.locator('form[action="?/profile"]').getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Profile saved.')).toBeVisible();

	await page.reload();
	await expect(page.getByLabel('Display Name')).toHaveValue(name);
});

test('the username follows the username rules', async ({ page }) => {
	await signIn(page);
	await page.goto('/settings', { waitUntil: 'networkidle' });

	await page.getByLabel('Username', { exact: true }).fill('Not Valid');
	await page.locator('form[action="?/profile"]').getByRole('button', { name: 'Save' }).click();

	await expect(page.locator('#settingsUsernameError')).toContainText('lowercase letters');
});

test('a password change needs the current password', async ({ page }) => {
	await signIn(page);
	await stepUp(page, TEST_OWNER.password);

	await page.getByLabel('Current Password').fill('not the password');
	await page.getByLabel('New Password').fill('another password');
	await page.getByLabel('Confirm Password').fill('another password');
	await page.getByRole('button', { name: 'Change Password' }).click();

	await expect(page.locator('#settingsCurrentPasswordError')).toHaveText(
		'The current password is not correct.'
	);
});

test('the password can be changed and changed back', async ({ page }) => {
	await signIn(page);

	// Each change starts a new session, so each needs its own step-up.
	async function changePassword(from: string, to: string): Promise<void> {
		await stepUp(page, from);
		await page.getByLabel('Current Password').fill(from);
		await page.getByLabel('New Password').fill(to);
		await page.getByLabel('Confirm Password').fill(to);
		await page.getByRole('button', { name: 'Change Password' }).click();
		await expect(
			page.getByText('Password changed. Other sessions were signed out.')
		).toBeVisible();
	}

	await changePassword(TEST_OWNER.password, 'temporary password');
	await changePassword('temporary password', TEST_OWNER.password);
});

test('the about section shows the credit and the version', async ({ page }) => {
	await signIn(page);
	await page.goto('/settings#about');

	const about = page.locator('#about');
	await expect(about).toContainText('Manifold, developed by Rua Systems.');
	await expect(about).toContainText('Version');
	await expect(about.locator('dd')).toHaveText(/^\d+\.\d+\.\d+/);
});
