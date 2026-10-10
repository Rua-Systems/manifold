import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { expect, signIn, test } from './fixtures';

// A one page PDF without a cross reference table; pdf.js rebuilds it, as it does for damaged files.
const PDF = Buffer.from(
	[
		'%PDF-1.4',
		'1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj',
		'2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj',
		'3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 200 200]>> endobj',
		'trailer <</Root 1 0 R>>',
		'%%EOF'
	].join('\n')
);

function unique(prefix: string): string {
	return `${prefix} ${randomUUID().slice(0, 8)}`;
}

function row(page: Page, name: string) {
	return page.locator('.items > .row', { hasText: name });
}

async function createFolder(page: Page, name: string): Promise<void> {
	await page.getByRole('button', { name: 'New Folder' }).click();
	const dialog = page.getByRole('dialog', { name: 'New Folder' });
	await dialog.getByLabel('Folder name').fill(name);
	await dialog.getByRole('button', { name: 'Create' }).click();
	await expect(dialog).toBeHidden();
	await expect(row(page, name)).toBeVisible();
}

async function upload(page: Page, name: string, mimeType: string, buffer: Buffer): Promise<void> {
	await page.locator('.upload-form input[type=file]').setInputFiles({ name, mimeType, buffer });
	await expect(page.locator('.uploads li', { hasText: name })).toHaveClass(/done/);
	await expect(row(page, name)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
	await page.goto('/files', { waitUntil: 'networkidle' });
});

test('a folder takes uploads, and a file is renamed, moved and deleted', async ({ page }) => {
	const folder = unique('Folder');
	const name = `${unique('notes')}.txt`;
	await createFolder(page, folder);
	await row(page, folder).getByRole('link').click();
	await expect(page.getByRole('navigation', { name: 'Location' })).toContainText(folder);

	await upload(page, name, 'text/plain', Buffer.from('first line\nsecond line'));
	await row(page, name).locator('a.main').click();
	await expect(page).toHaveURL(/\/files\/view\/[0-9a-f-]{36}$/);
	await expect(page.locator('pre')).toContainText('second line');
	await expect(page.getByText('Nothing shows this file.')).toBeVisible();

	const renamed = `${unique('renamed')}.txt`;
	await page.getByRole('button', { name: 'Rename', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Rename file' });
	await dialog.getByLabel('File name').fill(renamed);
	await dialog.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByRole('heading', { level: 1, name: renamed })).toBeVisible();

	await page.getByRole('button', { name: 'Move', exact: true }).click();
	const move = page.getByRole('dialog', { name: `Move "${renamed}"` });
	await move.getByLabel('Files', { exact: true }).check();
	await move.getByRole('button', { name: 'Move' }).click();
	await expect(move).toBeHidden();
	await expect(page.getByRole('navigation', { name: 'Location' })).not.toContainText(folder);

	await page.getByRole('button', { name: 'Delete', exact: true }).click();
	await page
		.getByRole('dialog', { name: 'Delete file' })
		.getByRole('button', { name: 'Delete' })
		.click();
	await expect(page).toHaveURL(/\/files$/);
	await expect(row(page, renamed)).toHaveCount(0);

	await row(page, folder)
		.getByRole('button', { name: `Delete ${folder}` })
		.click();
	await page
		.getByRole('dialog', { name: 'Delete folder' })
		.getByRole('button', { name: 'Delete' })
		.click();
	await expect(row(page, folder)).toHaveCount(0);
});

test('a PDF is shown page by page and the filter finds it', async ({ page }) => {
	const name = `${unique('scan')}.pdf`;
	await upload(page, name, 'application/pdf', PDF);

	await page.getByLabel('Filter files').fill(name.slice(0, 13));
	await expect(page).toHaveURL(/q=/);
	await expect(row(page, name)).toBeVisible();
	await page.locator('select[name=kind]').selectOption('image');
	await expect(row(page, name)).toHaveCount(0);
	await page.locator('select[name=kind]').selectOption('pdf');
	await row(page, name).locator('a.main').click();

	await expect(page.getByText('Pages: 1')).toBeVisible();
	await expect(page.getByRole('img', { name: 'Page 1 of 1' })).toBeVisible();
});

test('an image in a note is listed under Notes and cannot be deleted', async ({ page }) => {
	const title = unique('With image');
	await page.goto('/notes/new', { waitUntil: 'networkidle' });
	await page.getByLabel('Title', { exact: true }).fill(title);
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: 'Insert image' }).click();
	await (
		await chooser
	).setFiles({
		name: 'dot.png',
		mimeType: 'image/png',
		buffer: Buffer.from(
			'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
			'base64'
		)
	});
	await expect(page.locator('.status > .current')).toHaveText('Saved');

	await page.goto('/files', { waitUntil: 'networkidle' });
	await row(page, 'Notes').getByRole('link').click();
	await expect(page).toHaveURL(/source=notes/);
	const image = page.locator('.items > .row', { hasText: 'In use' }).first();
	await expect(image.getByRole('button', { name: /^Delete / })).toBeDisabled();
	await image.locator('a.main').click();
	await expect(page.getByRole('link', { name: title })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled();
});
