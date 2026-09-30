import { expect, test } from './fixtures';

test.use({ colorScheme: 'light' });

test('the initial theme follows the system preference', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'dark' });
	await page.goto('/login');

	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('a chosen theme applies at once and survives a reload', async ({ page }) => {
	await page.goto('/login', { waitUntil: 'networkidle' });
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

	const darkOption = page.getByRole('button', { name: 'Dark' });

	await page.getByRole('button', { name: 'Account menu' }).click();
	await darkOption.click();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	await expect(darkOption).toHaveAttribute('aria-pressed', 'true');

	await page.reload();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
