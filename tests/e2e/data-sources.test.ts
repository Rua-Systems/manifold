import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { TEST_OWNER } from '../support/owner.ts';
import { testDatabaseUrl } from '../support/test-database.ts';
import { expect, signIn, test } from './fixtures';

const SOURCE_URL = /\/data-sources\/[0-9a-f-]{36}$/;
const database = new URL(testDatabaseUrl());

function unique(prefix: string): string {
	return `${prefix} ${randomUUID().slice(0, 8)}`;
}

async function confirmIdentity(page: Page): Promise<void> {
	const dialog = page.getByRole('dialog', { name: 'Confirm Your Identity' });
	await dialog.getByLabel('Password', { exact: true }).fill(TEST_OWNER.password);
	await dialog.getByRole('button', { name: 'Confirm' }).click();
	await expect(dialog).toBeHidden();
}

/** Adds the test database as a PostgreSQL source and waits for its page. */
async function addDatabase(page: Page, name: string): Promise<void> {
	await page.goto('/data-sources/new', { waitUntil: 'networkidle' });
	await page.getByLabel('Name', { exact: true }).fill(name);
	await page.getByRole('textbox', { name: 'Notes' }).fill('Where the tests keep their data.');
	await page.getByLabel('Host', { exact: true }).fill(database.hostname);
	await page.getByLabel('Port', { exact: true }).fill(database.port);
	await page.getByLabel('Database', { exact: true }).fill(database.pathname.slice(1));
	await page.getByLabel('User name').fill(decodeURIComponent(database.username));
	await page.getByLabel('Password').fill(decodeURIComponent(database.password));
	await page.getByRole('button', { name: 'Add Data Source' }).click();
	await expect(page).toHaveURL(SOURCE_URL);
	await expect(page.getByText('Data source added.')).toBeVisible();
	await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('a database is added, tested, revealed after a step-up, changed and deleted', async ({
	page
}) => {
	await page.clock.install();
	const name = unique('Test database');
	await addDatabase(page, name);
	await expect(page.getByText('Not tested')).toBeVisible();

	await page.getByRole('button', { name: 'Test Connection' }).click();
	await expect(page.getByText(/^Connected: PostgreSQL \d+/)).toBeVisible();
	await expect(page.locator('.summary').getByText('Connected', { exact: true })).toBeVisible();

	// Secrets stay masked until a step-up, and hide again after a while.
	const password = decodeURIComponent(database.password);
	await expect(page.getByText(password, { exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: 'Reveal the secrets' }).click();
	await confirmIdentity(page);
	await expect(page.locator('.secrets .value')).toHaveText(password);
	await expect(page.locator('.url .value')).toContainText(`:${password}@`);
	await page.clock.fastForward(31_000);
	await expect(page.locator('.secrets .value')).toHaveText('••••••••');

	await page.getByRole('button', { name: 'Edit' }).click();
	const renamed = unique('Renamed database');
	await page.getByLabel('Name', { exact: true }).fill(renamed);
	await page.getByLabel('Host', { exact: true }).fill('');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.locator('#ds-host-error')).not.toBeEmpty();
	await page.getByLabel('Host', { exact: true }).fill(database.hostname);
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Data source saved.')).toBeVisible();
	await expect(page.getByRole('heading', { level: 1, name: renamed })).toBeVisible();

	await page.goto('/data-sources', { waitUntil: 'networkidle' });
	const row = page
		.getByRole('list', { name: 'Data Sources' })
		.getByRole('listitem')
		.filter({ hasText: renamed });
	await expect(row).toContainText('PostgreSQL');
	await expect(row).toContainText('Connected');

	await row.getByRole('link').click();
	await page.getByRole('button', { name: 'Delete' }).click();
	await page
		.getByRole('dialog', { name: 'Delete data source' })
		.getByRole('button', {
			name: 'Delete'
		})
		.click();
	await expect(page).toHaveURL(/\/data-sources$/);
	await expect(page.getByText('Data source deleted.')).toBeVisible();
	await expect(row).toHaveCount(0);
});

test('a link is added by type and tested from the list', async ({ page }) => {
	const name = unique('Health check');
	await page.goto('/data-sources/new', { waitUntil: 'networkidle' });
	await page.getByRole('link', { name: /Link or CDN/ }).click();
	await expect(page).toHaveURL(/type=link$/);
	await page.getByLabel('Name', { exact: true }).fill(name);
	await page.getByLabel('Address').fill('http://localhost:4173/healthz');
	await page.getByRole('button', { name: 'Add Data Source' }).click();
	await expect(page).toHaveURL(SOURCE_URL);

	await page.goto('/data-sources?type=link', { waitUntil: 'networkidle' });
	const row = page
		.getByRole('list', { name: 'Data Sources' })
		.getByRole('listitem')
		.filter({ hasText: name });
	await row.getByRole('button', { name: `Test ${name}` }).click();
	await expect(page.getByText(/^Connected: HTTP 200/)).toBeVisible();
	await expect(row).toContainText('Connected');
});

test('the SSH tunnel fields follow the switch and the sign in method', async ({ page }) => {
	await page.goto('/data-sources/new?type=mysql', { waitUntil: 'networkidle' });
	await expect(page.getByLabel('SSH host')).toHaveCount(0);
	await page.getByLabel('Connect through an SSH server').check();
	await expect(page.getByLabel('SSH host')).toBeVisible();
	await expect(page.getByLabel('SSH password')).toBeVisible();
	await page.getByText('Private key', { exact: true }).first().click();
	await expect(page.getByRole('textbox', { name: 'Private key', exact: true })).toBeVisible();
	await expect(page.getByLabel('SSH password')).toHaveCount(0);

	await page.getByRole('button', { name: 'Add Data Source' }).click();
	await expect(page.locator('#ds-ssh-host-error')).not.toBeEmpty();
	await expect(page.locator('#ds-name-error')).not.toBeEmpty();
});
