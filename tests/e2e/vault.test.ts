import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TEST_OWNER } from '../support/owner.ts';
import { expect, signIn, test } from './fixtures';

function card(page: Page, name: string) {
	return page.locator('.card', { hasText: name });
}

async function addSecret(page: Page, name: string, value: string): Promise<void> {
	await page.getByRole('button', { name: 'New Secret' }).click();
	const dialog = page.getByRole('dialog', { name: 'New Secret' });
	await dialog.getByLabel('Name').fill(name);
	await dialog.getByLabel('Service address').fill('https://mail.example.com');
	await dialog.getByLabel('Value', { exact: true }).fill(value);
	await dialog.getByRole('button', { name: 'Add Secret' }).click();
	await expect(page.getByText('Secret added.')).toBeVisible();
	await expect(dialog).toBeHidden();
}

async function confirmIdentity(page: Page): Promise<void> {
	const dialog = page.getByRole('dialog', { name: 'Confirm Your Identity' });
	await dialog.getByLabel('Password', { exact: true }).fill(TEST_OWNER.password);
	await dialog.getByRole('button', { name: 'Confirm' }).click();
	await expect(dialog).toBeHidden();
}

test.beforeEach(async ({ page }) => {
	await page.clock.install();
	await signIn(page);
	await page.goto('/vault', { waitUntil: 'networkidle' });
});

test('a value stays masked until revealed after a step-up, then hides again', async ({ page }) => {
	const name = `Mail ${randomUUID().slice(0, 8)}`;
	const value = `pw-${randomUUID()}`;
	await addSecret(page, name, value);
	await expect(card(page, name)).toContainText('••••');
	await expect(page.getByText(value)).toHaveCount(0);

	await card(page, name)
		.getByRole('button', { name: `Reveal the value of ${name}` })
		.click();
	await confirmIdentity(page);
	await expect(card(page, name).locator('code')).toHaveText(value);

	await page.clock.fastForward(31_000);
	await expect(card(page, name).locator('code')).toHaveCount(0);
	await expect(card(page, name)).toContainText('••••');
});

test('copying puts the value on the clipboard without showing it', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	const name = `Token ${randomUUID().slice(0, 8)}`;
	const value = `tok-${randomUUID()}`;
	await addSecret(page, name, value);

	await card(page, name)
		.getByRole('button', { name: `Copy the value of ${name}` })
		.click();
	await confirmIdentity(page);
	await expect(page.getByText('Copied to the clipboard.')).toBeVisible();
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(value);
	await expect(page.getByText(value)).toHaveCount(0);
});

test('changing the name needs nothing, changing the value needs a step-up', async ({ page }) => {
	const name = `Router ${randomUUID().slice(0, 8)}`;
	await addSecret(page, name, 'first value');

	await card(page, name)
		.getByRole('button', { name: `Edit ${name}` })
		.click();
	let dialog = page.getByRole('dialog', { name: 'Edit Secret' });
	await dialog.getByLabel('Name').fill(`${name} home`);
	await dialog.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Secret saved.')).toBeVisible();
	await expect(page.getByRole('dialog', { name: 'Confirm Your Identity' })).toBeHidden();

	await card(page, `${name} home`)
		.getByRole('button', { name: `Edit ${name} home` })
		.click();
	dialog = page.getByRole('dialog', { name: 'Edit Secret' });
	await dialog.getByLabel('New value').fill('second value');
	await dialog.getByRole('button', { name: 'Save' }).click();
	await confirmIdentity(page);
	// The clock is frozen, so the first save's notice may still be up.
	await expect(page.getByText('Secret saved.').last()).toBeVisible();

	await card(page, `${name} home`)
		.getByRole('button', { name: `Reveal the value of ${name} home` })
		.click();
	await expect(card(page, `${name} home`).locator('code')).toHaveText('second value');
});

test('a secret is deleted after confirmation and reveals are in the audit log', async ({
	page
}) => {
	const name = `Old ${randomUUID().slice(0, 8)}`;
	await addSecret(page, name, 'old value');
	await card(page, name)
		.getByRole('button', { name: `Reveal the value of ${name}` })
		.click();
	await confirmIdentity(page);
	await expect(card(page, name).locator('code')).toHaveText('old value');

	await card(page, name)
		.getByRole('button', { name: `Delete ${name}` })
		.click();
	const confirm = page.getByRole('dialog', { name: 'Delete Secret' });
	await expect(confirm).toContainText(`Delete ${name}?`);
	await confirm.getByRole('button', { name: 'Delete' }).click();
	await expect(page.getByText('Secret deleted.')).toBeVisible();
	await expect(card(page, name)).toHaveCount(0);

	await page.goto('/settings/security?action=vault.', { waitUntil: 'networkidle' });
	const actions = await page
		.getByRole('table', { name: 'Audit Log' })
		.locator('tbody code')
		.allTextContents();
	expect(actions).toEqual(
		expect.arrayContaining(['vault.create', 'vault.reveal', 'vault.delete'])
	);
});
