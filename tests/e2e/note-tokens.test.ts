import type { Browser, Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TEST_OWNER } from '../support/owner.ts';
import { expect, signIn, test } from './fixtures';

async function writeNote(page: Page, title: string, text: string): Promise<void> {
	await page.goto('/notes/new', { waitUntil: 'networkidle' });
	await page.getByLabel('Title', { exact: true }).fill(title);
	await page.getByRole('textbox', { name: 'Note content' }).click();
	await page.keyboard.type(text);
	await expect(page.locator('.status > .current')).toHaveText('Saved');
	await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
}

/** Creates a token in the note's Share dialog and answers its link and token. */
async function shareNote(
	page: Page,
	name: string,
	access: 'Read only' | 'Read and edit'
): Promise<{ link: string; token: string }> {
	await page.getByRole('button', { name: 'Share' }).click();
	const dialog = page.getByRole('dialog', { name: 'Share This Note' });
	await dialog.getByLabel('Name', { exact: true }).fill(name);
	await dialog.getByLabel(access).check();
	await expect(dialog.getByLabel('Works until')).not.toHaveValue('');
	await dialog.getByRole('button', { name: 'Create Token' }).click();

	// Every test signs in afresh, so creating a token always asks for the step-up first.
	const confirm = page.getByRole('dialog', { name: 'Confirm Your Identity' });
	await confirm.getByLabel('Password', { exact: true }).fill(TEST_OWNER.password);
	await confirm.getByRole('button', { name: 'Confirm' }).click();
	const codes = dialog.locator('.created code');
	await expect(codes.first()).toHaveText(/\/shared#mfn_/);
	const link = (await codes.nth(0).textContent()) ?? '';
	const token = (await codes.nth(1).textContent()) ?? '';
	await dialog.getByRole('button', { name: 'Close' }).click();
	return { link, token };
}

async function visitorPage(browser: Browser, baseURL: string, address: string): Promise<Page> {
	const context = await browser.newContext({
		baseURL,
		extraHTTPHeaders: { 'X-Forwarded-For': address }
	});
	return context.newPage();
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('a share link opens the note for editing without signing in, until it is revoked', async ({
	page,
	browser,
	baseURL,
	clientAddress
}) => {
	const title = `Shared ${randomUUID().slice(0, 8)}`;
	await writeNote(page, title, 'Written by the owner.');
	const name = `Editor ${randomUUID().slice(0, 8)}`;
	const { link, token } = await shareNote(page, name, 'Read and edit');
	expect(token).toMatch(/^mfn_[a-z0-9]{8}_/);
	expect(link.endsWith(`#${token}`)).toBe(true);

	const visitor = await visitorPage(browser, baseURL ?? '', clientAddress);
	await visitor.goto(link);
	await expect(visitor.getByLabel('Title', { exact: true })).toHaveValue(title);
	await expect(visitor).toHaveURL(/\/shared$/);
	await expect(visitor.getByText('Read and edit')).toBeVisible();
	await expect(visitor.getByRole('button', { name: 'Insert image' })).toHaveCount(0);
	await visitor.getByRole('textbox', { name: 'Note content' }).click();
	await visitor.keyboard.press('End');
	await visitor.keyboard.type(' Added by a visitor.');
	await expect(visitor.locator('.status > .current')).toHaveText('Saved');

	await page.reload();
	await expect(page.getByRole('textbox', { name: 'Note content' })).toContainText(
		'Added by a visitor.'
	);

	await page.goto('/settings/api-keys', { waitUntil: 'networkidle' });
	const card = page.locator('.card', { hasText: name });
	await expect(card).toContainText(title);
	await expect(card).toContainText('Read and edit');
	await card.getByRole('button', { name: `Revoke ${name}` }).click();
	await page
		.getByRole('dialog', { name: 'Revoke Note Token' })
		.getByRole('button', { name: 'Revoke' })
		.click();
	await expect(page.getByText('Note token revoked.')).toBeVisible();

	await visitor.reload();
	await expect(visitor.getByRole('button', { name: 'Open Note' })).toBeVisible();
	await expect(visitor.getByText(title)).toHaveCount(0);

	await card.getByRole('button', { name: `Delete ${name}` }).click();
	await page
		.getByRole('dialog', { name: 'Delete Note Token' })
		.getByRole('button', { name: 'Delete' })
		.click();
	await expect(page.getByText('Note token deleted.')).toBeVisible();
	await expect(page.locator('.card', { hasText: name })).toHaveCount(0);
	await visitor.context().close();
});

test('a read only token shows the note and reads it through the API', async ({
	page,
	browser,
	baseURL,
	clientAddress
}) => {
	const title = `Readable ${randomUUID().slice(0, 8)}`;
	await writeNote(page, title, 'Only to read.');
	const noteId = page.url().split('/').pop() ?? '';
	const { link, token } = await shareNote(
		page,
		`Reader ${randomUUID().slice(0, 8)}`,
		'Read only'
	);

	const visitor = await visitorPage(browser, baseURL ?? '', clientAddress);
	await visitor.goto(link);
	await expect(visitor.getByRole('heading', { level: 1, name: title })).toBeVisible();
	await expect(visitor.getByRole('textbox', { name: 'Note content' })).toHaveAttribute(
		'aria-readonly',
		'true'
	);
	await visitor.getByRole('button', { name: 'Close Note' }).click();
	await expect(visitor.getByText('The note is closed in this browser.')).toBeVisible();
	await visitor.context().close();

	const headers = { Authorization: `Bearer ${token}` };
	const read = await page.request.get(`/api/v1/notes/${noteId}`, { headers });
	expect(read.status()).toBe(200);
	expect(await read.json()).toMatchObject({ title });
	expect(
		(
			await page.request.patch(`/api/v1/notes/${noteId}`, { headers, data: { version: 1 } })
		).status()
	).toBe(403);
	expect((await page.request.get('/api/v1/notes', { headers })).status()).toBe(403);
});

test('a wrong token opens nothing', async ({ page }) => {
	await page.context().clearCookies();
	await page.goto('/shared', { waitUntil: 'networkidle' });
	await page.getByLabel('Access token').fill(`mfn_abcdefgh_${'A'.repeat(43)}`);
	await page.getByRole('button', { name: 'Open Note' }).click();
	await expect(
		page.getByText('This link or token is invalid, has expired or was revoked.')
	).toBeVisible();
});
