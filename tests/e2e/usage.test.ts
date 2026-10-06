import { randomUUID } from 'node:crypto';
import { expect, signIn, test } from './fixtures';

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('the usage report counts what the app keeps and measures again', async ({ page }) => {
	await page.goto('/notes/new', { waitUntil: 'networkidle' });
	await page.getByLabel('Title', { exact: true }).fill(`Usage ${randomUUID().slice(0, 8)}`);
	await expect(page.locator('.status > .current')).toHaveText('Saved');

	await page.goto('/settings', { waitUntil: 'networkidle' });
	await page
		.getByRole('navigation', { name: 'Settings sections' })
		.getByRole('link', { name: 'Usage' })
		.click();
	await expect(page).toHaveURL(/\/settings\/usage$/);
	await expect(page.getByRole('heading', { level: 1, name: 'Usage' })).toBeVisible();
	for (const heading of ['Overview', 'Content', 'Uploaded files', 'Database', 'Server']) {
		await expect(page.getByRole('heading', { level: 2, name: heading })).toBeVisible();
	}

	const content = page.getByRole('table', { name: 'Content' });
	for (const kind of ['Notes in the trash', 'Vault entries', 'Audit log events']) {
		await expect(content.getByRole('rowheader', { name: kind, exact: true })).toBeVisible();
	}
	const notes = content.locator('tr', {
		has: page.getByRole('rowheader', { name: 'Notes', exact: true })
	});
	const count = Number((await notes.locator('td').first().textContent())?.replace(/\D/g, ''));
	expect(count).toBeGreaterThanOrEqual(1);
	await expect(
		page.getByRole('table', { name: 'Database' }).getByRole('rowheader', {
			name: 'note',
			exact: true
		})
	).toBeVisible();

	await page.getByRole('button', { name: 'Measure Again' }).click();
	await expect(page.getByRole('button', { name: 'Measure Again' })).toBeEnabled();
	await expect(page.getByText(/^Measured /)).toBeVisible();
});
