import { gunzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { TEST_OWNER } from '../support/owner.ts';
import { expect, signIn, test } from './fixtures';

test('the export needs a step-up, then downloads the backup archive', async ({ page }) => {
	await signIn(page);
	await page.goto('/settings/data', { waitUntil: 'networkidle' });
	await expect(page.getByText(/does not hold ENCRYPTION_KEY/)).toBeVisible();

	await page.getByRole('link', { name: 'Download Export' }).click();
	await expect(page).toHaveURL(/\/step-up\?redirectTo=/);
	await page.getByLabel('Password', { exact: true }).fill(TEST_OWNER.password);

	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Confirm' }).click();
	const file = await download;
	expect(file.suggestedFilename()).toMatch(/^manifold-backup-\d{4}-\d{2}-\d{2}\.tar\.gz$/);

	const archive = gunzipSync(await readFile(await file.path()));
	const text = archive.toString('latin1');
	expect(text).toContain('manifest.json');
	expect(text).toContain('database.dump');
	expect(text).toContain('"app": "Manifold"');

	await page.goto('/settings/security?action=data.', { waitUntil: 'networkidle' });
	await expect(
		page
			.getByRole('table', { name: 'Audit Log' })
			.getByText('data.export', { exact: true })
			.first()
	).toBeVisible();
});
