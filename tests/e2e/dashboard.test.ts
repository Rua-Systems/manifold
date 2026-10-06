import { randomUUID } from 'node:crypto';
import { expect, signIn, test } from './fixtures';

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('signing in opens the dashboard with a card for every part', async ({ page }) => {
	await expect(page).toHaveURL(/\/dashboard$/);
	await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
	for (const title of ['Services', 'Notes', 'Map Notes', 'Security and Access', 'Usage']) {
		await expect(
			page.getByRole('heading', { level: 2, name: title, exact: true })
		).toBeVisible();
	}
	await expect(page.getByRole('heading', { level: 2, name: 'Vault' })).toHaveCount(0);

	await page.getByRole('link', { name: 'Open Usage' }).click();
	await expect(page).toHaveURL(/\/settings\/usage$/);
});

test('a changed note shows up among the recent ones', async ({ page }) => {
	const title = `Recent ${randomUUID().slice(0, 8)}`;
	await page.goto('/notes/new', { waitUntil: 'networkidle' });
	await page.getByLabel('Title', { exact: true }).fill(title);
	await expect(page.locator('.status > .current')).toHaveText('Saved');

	await page.goto('/dashboard', { waitUntil: 'networkidle' });
	const notes = page.getByRole('region', { name: 'Notes', exact: true });
	await notes.getByRole('link', { name: new RegExp(title) }).click();
	await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
});

test('the charts read out each day from the keyboard', async ({ page }) => {
	const chart = page.getByRole('slider', { name: 'Note revisions per day, last 30 days' });
	await chart.focus();
	const today = await chart.getAttribute('aria-valuetext');
	await chart.press('ArrowLeft');
	await expect(chart).toHaveAttribute('aria-valuenow', '28');
	await chart.press('Home');
	await expect(chart).toHaveAttribute('aria-valuenow', '0');
	expect(today).not.toBeNull();
	await expect(
		page.getByRole('table', { name: 'Note revisions per day, last 30 days' })
	).toHaveCount(1);
});
