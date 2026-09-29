import { expect, test } from '@playwright/test';

test('home shows the wordmark and links to about', async ({ page }) => {
	await page.goto('/');

	await expect(page.getByRole('heading', { level: 1, name: 'manifold' })).toBeVisible();
	await expect(page).toHaveTitle('Manifold · Rua Systems');

	await page.getByRole('link', { name: 'about', exact: true }).click();
	await expect(page).toHaveURL('/about');
	await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible();
});

test('every page declares a meta description', async ({ page }) => {
	for (const path of ['/', '/about', '/login', '/forgot-password']) {
		await page.goto(path);
		await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /\S/);
	}
});
