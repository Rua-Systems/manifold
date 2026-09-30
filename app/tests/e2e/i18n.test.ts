import { expect, test } from './fixtures';

test('english is served without a prefix', async ({ page }) => {
	await page.goto('/login');

	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	await expect(page.getByRole('heading', { level: 1, name: 'Login' })).toBeVisible();
});

test('turkish is served under /tr', async ({ page }) => {
	await page.goto('/tr/login');

	await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
	await expect(page.getByRole('heading', { level: 1, name: 'Giriş' })).toBeVisible();
});

test('pages declare alternates for every locale', async ({ page }) => {
	await page.goto('/login');

	await expect(page.locator('link[rel="alternate"][hreflang="tr"]')).toHaveAttribute(
		'href',
		/\/tr\/login$/
	);
	await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute(
		'href',
		/\/login$/
	);
});

test('the language switch moves to the same page in the other locale', async ({ page }) => {
	await page.goto('/login', { waitUntil: 'networkidle' });

	await page.getByRole('button', { name: 'Account menu' }).click();
	await page.getByRole('link', { name: 'Türkçe' }).click();

	await expect(page).toHaveURL(/\/tr\/login$/);
	await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
});
