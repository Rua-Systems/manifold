import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { expect, signIn, test } from './fixtures';

const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64'
);

const NOT_AN_IMAGE = Buffer.from('#!/bin/sh\necho not an image\n');

function uniqueAlias(prefix: string): string {
	return `${prefix} ${randomUUID().slice(0, 8)}`;
}

async function addService(page: Page, alias: string, url = 'https://example.com'): Promise<void> {
	await page.getByRole('button', { name: 'New Service' }).click();
	const dialog = page.getByRole('dialog', { name: 'New Service' });
	await dialog.getByLabel('Alias').fill(alias);
	await dialog.getByLabel('URL').fill(url);
	await dialog.getByRole('button', { name: 'Add Service' }).click();
	await expect(page.getByText('Service added.').first()).toBeVisible();
	await expect(dialog).toBeHidden();
}

function card(page: Page, alias: string) {
	return page.locator('.card', { hasText: alias });
}

async function aliasesInList(page: Page): Promise<string[]> {
	return page
		.locator('.card .text > a')
		.evaluateAll((links) => links.map((link) => link.childNodes[0]?.textContent?.trim() ?? ''));
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
	await page.goto('/services', { waitUntil: 'networkidle' });
});

test('a service can be added, edited and deleted', async ({ page }) => {
	const alias = uniqueAlias('Grafana');
	await addService(page, alias, 'https://grafana.example.com');
	await expect(card(page, alias)).toContainText('https://grafana.example.com');

	const renamed = `${alias} Prod`;
	await page.getByRole('button', { name: `Edit ${alias}` }).click();
	const editDialog = page.getByRole('dialog', { name: 'Edit Service' });
	await editDialog.getByLabel('Alias').fill(renamed);
	await editDialog.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Service saved.')).toBeVisible();
	await expect(card(page, renamed)).toBeVisible();

	await page.getByRole('button', { name: `Delete ${renamed}` }).click();
	const confirm = page.getByRole('dialog', { name: 'Delete Service' });
	await expect(confirm).toContainText(`Delete ${renamed}?`);
	await confirm.getByRole('button', { name: 'Delete' }).click();
	await expect(page.getByText('Service deleted.')).toBeVisible();
	await expect(card(page, renamed)).toHaveCount(0);
});

test('only http and https addresses are accepted', async ({ page }) => {
	await page.getByRole('button', { name: 'New Service' }).click();
	const dialog = page.getByRole('dialog', { name: 'New Service' });
	await dialog.getByLabel('Alias').fill(uniqueAlias('Bad'));
	await dialog.getByLabel('URL').fill('javascript:alert(1)');
	await dialog.getByRole('button', { name: 'Add Service' }).click();

	await expect(dialog.locator('#serviceUrlError')).toHaveText(
		'Enter an address that starts with http:// or https://.'
	);
});

test('the server refuses other schemes even without the browser checks', async ({ page }) => {
	const response = await page.request.post('/services?/create', {
		multipart: { alias: uniqueAlias('Direct'), url: 'javascript:alert(1)' },
		// A browser without JavaScript: SvelteKit answers with the page and the failure status.
		headers: { Origin: 'http://localhost:4173', Accept: 'text/html' }
	});

	expect(response.status()).toBe(400);
});

test('the order changes with the move buttons and persists', async ({ page }) => {
	const first = uniqueAlias('First');
	const second = uniqueAlias('Second');
	await addService(page, first);
	await addService(page, second);

	await page.getByRole('button', { name: `Move ${second} up` }).click();
	await expect(page.getByText('Order saved.')).toBeVisible();

	await page.reload();
	const aliases = await aliasesInList(page);
	expect(aliases.indexOf(second)).toBeLessThan(aliases.indexOf(first));
});

test('services can be dragged into a new order', async ({ page, isMobile }) => {
	test.skip(isMobile, 'Dragging is a mouse gesture; phones use the move buttons.');
	const first = uniqueAlias('Drag A');
	const second = uniqueAlias('Drag B');
	await addService(page, first);
	await addService(page, second);

	await card(page, second).dragTo(card(page, first));

	await expect
		.poll(async () => {
			await page.reload();
			const aliases = await aliasesInList(page);
			return aliases.indexOf(second) < aliases.indexOf(first);
		})
		.toBe(true);
});

test('an icon upload shows a preview and is served back', async ({ page }) => {
	const alias = uniqueAlias('Icon');
	await page.getByRole('button', { name: 'New Service' }).click();
	const dialog = page.getByRole('dialog', { name: 'New Service' });
	await dialog.getByLabel('Alias').fill(alias);
	await dialog.getByLabel('URL').fill('https://icon.example.com');
	await dialog
		.getByLabel('Icon')
		.setInputFiles({ name: 'icon.png', mimeType: 'image/png', buffer: PNG });
	await expect(dialog.locator('.service-icon img')).toHaveAttribute('src', /^blob:/);
	await dialog.getByRole('button', { name: 'Add Service' }).click();
	await expect(page.getByText('Service added.')).toBeVisible();

	const source = await card(page, alias).locator('.service-icon img').getAttribute('src');
	expect(source).toMatch(/^\/files\/[0-9a-f-]{36}$/);

	const response = await page.request.get(source ?? '');
	expect(response.status()).toBe(200);
	expect(response.headers()['content-type']).toBe('image/png');
	expect(response.headers()['x-content-type-options']).toBe('nosniff');
	expect(response.headers()['content-security-policy']).toContain('sandbox');
	expect(response.headers()['content-disposition']).toContain('inline');
});

test('a renamed file that is not an image is refused', async ({ page }) => {
	await page.getByRole('button', { name: 'New Service' }).click();
	const dialog = page.getByRole('dialog', { name: 'New Service' });
	await dialog.getByLabel('Alias').fill(uniqueAlias('Fake'));
	await dialog.getByLabel('URL').fill('https://fake.example.com');
	await dialog
		.getByLabel('Icon')
		.setInputFiles({ name: 'icon.png', mimeType: 'image/png', buffer: NOT_AN_IMAGE });
	await dialog.getByRole('button', { name: 'Add Service' }).click();

	await expect(dialog.locator('#serviceIconError')).toHaveText(
		'Use a PNG, JPEG, WebP, GIF or SVG image.'
	);
});

test('files are only served to the signed in owner', async ({ page, playwright }) => {
	const alias = uniqueAlias('Private');
	await page.getByRole('button', { name: 'New Service' }).click();
	const dialog = page.getByRole('dialog', { name: 'New Service' });
	await dialog.getByLabel('Alias').fill(alias);
	await dialog.getByLabel('URL').fill('https://private.example.com');
	await dialog
		.getByLabel('Icon')
		.setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: PNG });
	await dialog.getByRole('button', { name: 'Add Service' }).click();
	await expect(page.getByText('Service added.')).toBeVisible();
	const source = await card(page, alias).locator('.service-icon img').getAttribute('src');

	const guest = await playwright.request.newContext({ baseURL: 'http://localhost:4173' });
	expect((await guest.get(source ?? '')).status()).toBe(401);
	await guest.dispose();
});

test('the sidebar lists services in order and opens them in a new tab', async ({
	page,
	isMobile
}) => {
	const first = uniqueAlias('Side A');
	const second = uniqueAlias('Side B');
	await addService(page, first, 'https://side-a.example.com');
	await addService(page, second, 'https://side-b.example.com');

	if (isMobile) {
		await page.getByRole('button', { name: 'Open navigation' }).click();
	}
	const group = page.locator('#sidebarGroup-services');
	const firstLink = group.getByRole('link', { name: first });
	await expect(firstLink).toHaveAttribute('href', 'https://side-a.example.com');
	await expect(firstLink).toHaveAttribute('target', '_blank');
	await expect(firstLink).toHaveAttribute('rel', /noopener/);
	await expect(firstLink).toHaveAttribute('rel', /noreferrer/);

	const labels = await group.locator('.child-label').allTextContents();
	expect(labels.indexOf(first)).toBeLessThan(labels.indexOf(second));
	expect(labels.at(-1)).toBe('Manage');
});

test('a closed sidebar group stays closed after a reload', async ({ page, isMobile }) => {
	if (isMobile) {
		await page.getByRole('button', { name: 'Open navigation' }).click();
	}
	await page.getByRole('button', { name: 'Collapse Services' }).click();
	await expect(page.locator('#sidebarGroup-services')).toHaveCount(0);

	await page.reload();
	if (isMobile) {
		await page.getByRole('button', { name: 'Open navigation' }).click();
	}
	await expect(page.locator('#sidebarGroup-services')).toHaveCount(0);
	await page.getByRole('button', { name: 'Expand Services' }).click();
	await expect(page.locator('#sidebarGroup-services')).toBeVisible();
});

test('on the icon rail a group click opens the sidebar first', async ({ page, isMobile }) => {
	test.skip(isMobile, 'The icon rail only exists on desktop.');
	await page.goto('/settings', { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: 'Collapse sidebar' }).click();

	await page.locator('#appSidebar').getByRole('link', { name: 'Services' }).click();
	await expect(page).toHaveURL(/\/settings$/);
	await expect(page.getByRole('button', { name: 'Collapse sidebar' })).toBeVisible();

	await page.locator('#appSidebar').getByRole('link', { name: 'Services' }).click();
	await expect(page).toHaveURL(/\/services$/);
});

test('dialogs fill the screen on phones', async ({ page, isMobile }) => {
	test.skip(!isMobile, 'Only phones get the full-screen sheet.');
	await page.getByRole('button', { name: 'New Service' }).click();

	const box = await page.getByRole('dialog', { name: 'New Service' }).boundingBox();
	const viewport = page.viewportSize();
	expect(box?.width).toBe(viewport?.width);
	expect(Math.round(box?.height ?? 0)).toBe(viewport?.height);
});
