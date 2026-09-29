import type { Page } from '@playwright/test';
import { TEST_OWNER } from '../support/owner.ts';
import { expect, signIn, test } from './fixtures';

const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64'
);

/** Creates a key in Settings, answering the step-up dialog, and reads it off the page. */
async function createKey(page: Page, name: string, scopes: string[]): Promise<string> {
	await page.goto('/settings/api-keys', { waitUntil: 'networkidle' });
	await page.getByLabel('Name', { exact: true }).fill(name);
	for (const scope of scopes) {
		await page.getByRole('checkbox', { name: new RegExp(scope) }).check();
	}
	await page.getByRole('button', { name: 'Create Key' }).click();

	// Every test signs in afresh, so creating a key always asks for the step-up first.
	const dialog = page.getByRole('dialog', { name: 'Confirm Your Identity' });
	await dialog.getByLabel('Password', { exact: true }).fill(TEST_OWNER.password);
	await dialog.getByRole('button', { name: 'Confirm' }).click();
	const shown = page.locator('.new-key code');
	await expect(shown).toHaveText(/^mfd_[a-z0-9]{8}_/);
	return (await shown.textContent()) ?? '';
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('a key is shown once, works on the API and stops working when revoked', async ({ page }) => {
	const name = `Script ${Date.now()}`;
	await page.goto('/settings/api-keys', { waitUntil: 'networkidle' });
	await page.getByRole('checkbox', { name: /notes:write/ }).check();
	await expect(page.getByRole('checkbox', { name: /notes:read/ })).toBeChecked();
	await page.getByRole('checkbox', { name: /notes:write/ }).uncheck();

	const key = await createKey(page, name, ['notes:write']);

	await page.reload();
	await expect(page.locator('.new-key')).toHaveCount(0);
	const card = page.locator('.card', { hasText: name });
	await expect(card).toContainText(`mfd_${key.slice(4, 12)}_`);
	await expect(card).toContainText('notes:read');

	const headers = { Authorization: `Bearer ${key}` };
	const me = await page.request.get('/api/v1/me', { headers });
	expect(me.status()).toBe(200);
	expect(await me.json()).toMatchObject({ name, scopes: ['notes:read', 'notes:write'] });

	const created = await page.request.post('/api/v1/notes', {
		headers,
		data: { title: 'From the API', markdown: '**Bold** text' }
	});
	expect(created.status()).toBe(201);
	expect(created.headers()['ratelimit-limit']).toBe('120');
	expect((await page.request.get('/api/v1/services', { headers })).status()).toBe(403);

	await card.getByRole('button', { name: `Revoke ${name}` }).click();
	await page
		.getByRole('dialog', { name: 'Revoke API Key' })
		.getByRole('button', { name: 'Revoke' })
		.click();
	await expect(page.getByText('API key revoked.')).toBeVisible();
	await expect(page.locator('.card', { hasText: name })).toContainText('Revoked');
	expect((await page.request.get('/api/v1/me', { headers })).status()).toBe(401);
});

test('the API ignores session cookies and answers errors as JSON', async ({ page }) => {
	const response = await page.request.get('/api/v1/me');
	expect(response.status()).toBe(401);
	expect(await response.json()).toEqual({
		error: {
			code: 'missing_key',
			message: 'Send an API key as `Authorization: Bearer <key>`.'
		}
	});
});

test('files uploaded with a key are served to that key on both addresses', async ({ page }) => {
	const key = await createKey(page, `Files ${Date.now()}`, ['files:write']);
	const headers = { Authorization: `Bearer ${key}` };

	const uploaded = await page.request.post('/api/v1/files', {
		headers,
		multipart: { file: { name: 'dot.png', mimeType: 'image/png', buffer: PNG } }
	});
	expect(uploaded.status()).toBe(201);
	const { id, url } = (await uploaded.json()) as { id: string; url: string };

	await page.context().clearCookies();
	expect((await page.request.get(url)).status()).toBe(401);
	const viaFiles = await page.request.get(url, { headers });
	expect(viaFiles.status()).toBe(200);
	expect(viaFiles.headers()['content-type']).toBe('image/png');
	expect((await page.request.get(`/api/v1/files/${id}`, { headers })).status()).toBe(200);
});

test('the OpenAPI document lists the API', async ({ page }) => {
	const key = await createKey(page, `Docs ${Date.now()}`, ['services:read']);
	const response = await page.request.get('/api/v1/openapi.json', {
		headers: { Authorization: `Bearer ${key}` }
	});
	expect(response.status()).toBe(200);
	const document = (await response.json()) as { openapi: string; paths: Record<string, unknown> };
	expect(document.openapi).toBe('3.1.0');
	expect(Object.keys(document.paths)).toEqual(
		expect.arrayContaining([
			'/notes',
			'/notes/{id}',
			'/map/features',
			'/services',
			'/files',
			'/me'
		])
	);
});
