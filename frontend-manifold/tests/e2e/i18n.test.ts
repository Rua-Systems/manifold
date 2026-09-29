import { expect, test } from '@playwright/test';

test('english is served without a prefix', async ({ page }) => {
	await page.goto('/');

	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	await expect(page.getByText('++ Welcome to the ++')).toBeVisible();
});

test('turkish is served under /tr', async ({ page }) => {
	await page.goto('/tr/about');

	await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
	await expect(page.getByRole('heading', { level: 1, name: 'Hakkında' })).toBeVisible();
});

test('pages declare alternates for every locale', async ({ page }) => {
	await page.goto('/about');

	await expect(page.locator('link[rel="alternate"][hreflang="tr"]')).toHaveAttribute(
		'href',
		/\/tr\/about$/
	);
	await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute(
		'href',
		/\/about$/
	);
});

test('the language switch moves to the same page in the other locale', async ({ page }) => {
	await page.goto('/about', { waitUntil: 'networkidle' });

	await page.getByRole('button', { name: 'Menu' }).click();
	await page.getByRole('link', { name: 'Türkçe' }).click();

	await expect(page).toHaveURL('/tr/about');
	await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
});
