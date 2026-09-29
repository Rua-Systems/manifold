import type { Page } from '@playwright/test';
import { TEST_OWNER } from '../support/owner.ts';
import { withDatabase } from './database';
import { expect, signIn, test } from './fixtures';

test.afterEach(async () => {
	await withDatabase((sql) => sql`update "user" set email = ${TEST_OWNER.email}`);
});

function stepUpDialog(page: Page) {
	return page.getByRole('dialog', { name: 'Confirm Your Identity' });
}

async function submitEmail(page: Page, email: string): Promise<void> {
	await page.getByLabel('Email', { exact: true }).fill(email);
	await page.getByRole('button', { name: 'Change Email' }).click();
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
	await page.goto('/settings', { waitUntil: 'networkidle' });
});

test('a sensitive change asks for the password once, then not for ten minutes', async ({
	page
}) => {
	await submitEmail(page, 'owner.new@example.test');
	const dialog = stepUpDialog(page);
	await expect(dialog).toBeVisible();
	await dialog.getByLabel('Password', { exact: true }).fill(TEST_OWNER.password);
	await dialog.getByRole('button', { name: 'Confirm' }).click();

	await expect(dialog).toBeHidden();
	await expect(page.getByText('Email updated.')).toBeVisible();

	await page.reload();
	await submitEmail(page, TEST_OWNER.email);
	await expect(page.getByText('Email updated.')).toBeVisible();
	await expect(stepUpDialog(page)).toBeHidden();
});

test('a wrong password keeps the dialog open and changes nothing', async ({ page }) => {
	await submitEmail(page, 'owner.other@example.test');
	const dialog = stepUpDialog(page);
	await dialog.getByLabel('Password', { exact: true }).fill('not the password');
	await dialog.getByRole('button', { name: 'Confirm' }).click();
	await expect(dialog.locator('#stepUpDialogPasswordError')).toHaveText(
		'The current password is not correct.'
	);

	await dialog.getByRole('button', { name: 'Close' }).click();
	await expect(dialog).toBeHidden();
	const email = await withDatabase(async (sql) => {
		const [row] = await sql<{ email: string }[]>`select email from "user" limit 1`;
		return row.email;
	});
	expect(email).toBe(TEST_OWNER.email);
});

test('the step-up expires after ten minutes', async ({ page }) => {
	await submitEmail(page, 'owner.new@example.test');
	await stepUpDialog(page).getByLabel('Password', { exact: true }).fill(TEST_OWNER.password);
	await stepUpDialog(page).getByRole('button', { name: 'Confirm' }).click();
	await expect(page.getByText('Email updated.')).toBeVisible();

	await withDatabase(
		(sql) =>
			sql`update session_step_up set stepped_up_at = stepped_up_at - interval '11 minutes'`
	);
	await page.reload();
	await submitEmail(page, TEST_OWNER.email);
	await expect(stepUpDialog(page)).toBeVisible();
});

test('without the dialog, the step-up page confirms and returns', async ({ page }) => {
	await page.goto('/step-up?redirectTo=/settings', { waitUntil: 'networkidle' });
	await page.getByLabel('Password', { exact: true }).fill(TEST_OWNER.password);
	await page.getByRole('button', { name: 'Confirm' }).click();
	await page.waitForURL(/\/settings$/);

	await submitEmail(page, 'owner.page@example.test');
	await expect(page.getByText('Email updated.')).toBeVisible();
	await expect(stepUpDialog(page)).toBeHidden();
});
