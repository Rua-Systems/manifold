import { expect, test } from '@playwright/test';

test('dashboard pages send guests to login and remember the target', async ({ page }) => {
	await page.goto('/dashboard/map-notes');

	await expect(page).toHaveURL('/login?redirectTo=%2Fdashboard%2Fmap-notes');
	await expect(page.getByRole('heading', { level: 1, name: 'Login' })).toBeVisible();
});

test('turkish dashboard pages send guests to the turkish login', async ({ page }) => {
	await page.goto('/tr/dashboard');

	await expect(page).toHaveURL('/tr/login?redirectTo=%2Ftr%2Fdashboard');
});

test('login reports empty fields without leaving the page', async ({ page }) => {
	await page.goto('/login', { waitUntil: 'networkidle' });

	await page.getByRole('button', { name: 'Authenticate' }).click();

	await expect(page.locator('#loginEmailError')).toHaveText('This field is required.');
	await expect(page.locator('#loginPasswordError')).toHaveText('This field is required.');
	await expect(page).toHaveURL('/login');
});

test('login rejects a malformed email address', async ({ page }) => {
	await page.goto('/login', { waitUntil: 'networkidle' });

	await page.getByLabel('Email').fill('owner@');
	await page.getByLabel('Password').fill('secret');
	await page.getByRole('button', { name: 'Authenticate' }).click();

	await expect(page.locator('#loginEmailError')).toHaveText('Enter a valid email address.');
});

test('switching the login method clears visible errors', async ({ page }) => {
	await page.goto('/login', { waitUntil: 'networkidle' });

	await page.getByRole('button', { name: 'Authenticate' }).click();
	await expect(page.locator('#loginEmailError')).toHaveText('This field is required.');

	await page.getByRole('button', { name: 'Email Code' }).click();
	await expect(page.locator('#codeEmailError')).toHaveText('');
});

test('password reset asks for an email first', async ({ page }) => {
	await page.goto('/forgot-password', { waitUntil: 'networkidle' });

	await page.getByRole('button', { name: 'Send Code' }).click();

	await expect(page.locator('#recoveryEmailError')).toHaveText('This field is required.');
});
