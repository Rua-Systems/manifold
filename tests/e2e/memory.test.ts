import type { Page } from '@playwright/test';
import { TEST_OWNER } from '../support/owner.ts';
import { withDatabase } from './database';
import { expect, signIn, test } from './fixtures';

const MEMORY_URL = /\/memory\/[0-9a-f-]{36}$/;

function editor(page: Page) {
	return page.getByRole('textbox', { name: 'Memory text' });
}

test.beforeEach(async ({ page }) => {
	await withDatabase(async (sql) => {
		await sql`delete from memory`;
		await sql`delete from memory_key_category`;
		await sql`delete from memory_category where parent_id is not null`;
		await sql`delete from memory_category`;
		await sql`delete from tag`;
		await sql`insert into tag (name, color) values ('decision', 'amber'), ('style', 'blue')`;
	});
	await signIn(page);
});

async function addCategory(page: Page, name: string, parent: string | null): Promise<void> {
	if (parent === null) {
		await page.getByRole('button', { name: 'New Category' }).click();
	} else {
		await page.getByRole('button', { name: `Add a subcategory to ${parent}` }).click();
	}
	const dialog = page.getByRole('dialog');
	await dialog.getByLabel('Name').fill(name);
	await dialog.getByRole('button', { name: 'Add Category' }).click();
	await expect(page.getByText('Category added.')).toBeVisible();
	await expect(dialog).toBeHidden();
}

test('categories nest two levels, are renamed, and only empty ones are deleted', async ({
	page
}) => {
	await page.goto('/memory/categories', { waitUntil: 'networkidle' });
	await expect(page.getByText('No categories yet.')).toBeVisible();
	await addCategory(page, 'Work', null);
	await addCategory(page, 'Atlas', 'Work');
	const tree = page.getByRole('list', { name: 'Categories' });
	await expect(tree).toContainText('Atlas');
	// A subcategory offers no further subcategories.
	await expect(page.getByRole('button', { name: 'Add a subcategory to Atlas' })).toHaveCount(0);

	await page.getByRole('button', { name: 'Rename Atlas' }).click();
	const rename = page.getByRole('dialog', { name: 'Rename Category' });
	await rename.getByLabel('Name').fill('Atlas Project');
	await rename.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Category renamed.')).toBeVisible();

	await page.getByRole('button', { name: 'Delete Work' }).click();
	await page
		.getByRole('dialog', { name: 'Delete Category' })
		.getByRole('button', { name: 'Delete' })
		.click();
	await expect(
		page.getByText('Move or trash the memories and subcategories in it first.')
	).toBeVisible();

	await page.getByRole('button', { name: 'Delete Atlas Project' }).click();
	await page
		.getByRole('dialog', { name: 'Delete Category' })
		.getByRole('button', { name: 'Delete' })
		.click();
	await expect(page.getByText('Category deleted.')).toBeVisible();
	await expect(tree).not.toContainText('Atlas Project');
});

test('a memory is written with a category, tags and a pin, then found and changed', async ({
	page
}) => {
	await withDatabase((sql) => sql`insert into memory_category (name) values ('Work')`);
	await page.goto('/memory', { waitUntil: 'networkidle' });
	await expect(page.getByText('No memories yet.')).toBeVisible();
	await page.getByRole('link', { name: 'New Memory' }).first().click();
	await expect(page).toHaveURL(/\/memory\/new$/);

	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.locator('#memoryTitleError')).toHaveText('This field is required.');

	await page.getByLabel('Title', { exact: true }).fill('Commit style');
	await page.getByLabel('Category').selectOption({ label: 'Work' });
	await page.getByRole('checkbox', { name: 'style' }).check();
	await page.getByRole('checkbox', { name: 'Pinned' }).check();
	await editor(page).click();
	await page.keyboard.type('Use the imperative mood.');
	await expect(page.getByText('Unsaved changes')).toBeVisible();
	await page.keyboard.press('ControlOrMeta+s');
	await expect(page).toHaveURL(MEMORY_URL);
	await expect(page.getByText('Memory saved.')).toBeVisible();
	await expect(page.getByLabel('Category')).toHaveValue(/[0-9a-f-]{36}/);
	await expect(page.getByRole('checkbox', { name: 'style' })).toBeChecked();
	await expect(page.getByText(/Last changed by You/)).toBeVisible();

	await editor(page).click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type(' Keep subjects short.');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Memory saved.').last()).toBeVisible();
	await expect(page.getByText('Unsaved changes')).toBeHidden();

	await page.getByRole('button', { name: 'History' }).click();
	const history = page.getByRole('dialog', { name: 'History' });
	await expect(history).toContainText('Version 2');
	await expect(history).toContainText('You');
	await history.getByRole('button', { name: 'Close' }).click();

	await page.goto('/memory', { waitUntil: 'networkidle' });
	const list = page.getByRole('list', { name: 'Memories' });
	const row = list.getByRole('listitem').filter({ hasText: 'Commit style' }).first();
	await expect(row).toContainText('Pinned');
	await expect(row).toContainText('style');
	await expect(row).toContainText('Keep subjects short.');

	await page.locator('#memoryFilter').fill('imperative');
	await expect(list).toContainText('Commit style');
	await page.locator('#memoryFilter').fill('nothing like this');
	await expect(page.getByText('No memory matches the filter.')).toBeVisible();
});

test('a change made elsewhere shows a conflict, and keeping mine saves over it', async ({
	page
}) => {
	const [created] = await withDatabase(
		(sql) => sql<{ id: string }[]>`
			insert into memory (title, content, content_text)
			values ('Shared', '{"type":"doc","content":[{"type":"paragraph"}]}', '')
			returning id
		`
	);
	await page.goto(`/memory/${created.id}`, { waitUntil: 'networkidle' });
	await withDatabase(
		(sql) =>
			sql`update memory set version = 2, title = 'Shared elsewhere' where id = ${created.id}`
	);
	await editor(page).click();
	await page.keyboard.type('Mine.');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('This memory was changed somewhere else.')).toBeVisible();
	await page.getByRole('button', { name: 'Keep Mine' }).click();
	await expect(page.getByText('Memory saved.')).toBeVisible();
	const [row] = await withDatabase(
		(sql) => sql<{ version: number; content_text: string }[]>`
			select version, content_text from memory where id = ${created.id}
		`
	);
	expect(row).toMatchObject({ version: 3, content_text: 'Mine.' });
});

test('a memory goes to the trash, comes back, and is deleted for good', async ({ page }) => {
	const [created] = await withDatabase(
		(sql) => sql<{ id: string }[]>`
			insert into memory (title, content, content_text)
			values ('Old fact', '{"type":"doc","content":[{"type":"paragraph"}]}', '')
			returning id
		`
	);
	await page.goto(`/memory/${created.id}`, { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: 'Move to trash' }).click();
	await expect(page).toHaveURL(/\/memory$/);
	await expect(page.getByText('Memory moved to the trash.')).toBeVisible();

	await page.goto('/memory/trash', { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: 'Restore Old fact' }).click();
	await expect(page.getByText('Memory restored.')).toBeVisible();
	await expect(page.getByText('The trash is empty.')).toBeVisible();

	await withDatabase((sql) => sql`update memory set deleted_at = now() where id = ${created.id}`);
	await page.reload({ waitUntil: 'networkidle' });
	await page.getByRole('button', { name: 'Delete Old fact forever' }).click();
	await page
		.getByRole('dialog', { name: 'Delete Memory' })
		.getByRole('button', { name: 'Delete Forever' })
		.click();
	await expect(page.getByText('Memory deleted for good.')).toBeVisible();
	await expect(page.getByText('The trash is empty.')).toBeVisible();
});

test('an API key with a memory scope can be limited to categories', async ({ page }) => {
	await withDatabase((sql) => sql`insert into memory_category (name) values ('Work'), ('Home')`);
	await page.goto('/settings/api-keys', { waitUntil: 'networkidle' });
	const limits = page.getByRole('group', { name: 'Memory categories' });
	await expect(limits).toHaveCount(0);
	await page.getByLabel('Name', { exact: true }).fill('Work agent');
	await page.getByRole('checkbox', { name: /Change memories/ }).check();
	await expect(limits).toBeVisible();
	await limits.getByRole('checkbox', { name: 'Work' }).check();
	await page.getByRole('button', { name: 'Create Key' }).click();
	// Every test signs in afresh, so creating a key always asks for the step-up first.
	const confirm = page.getByRole('dialog', { name: 'Confirm Your Identity' });
	await confirm.getByLabel('Password', { exact: true }).fill(TEST_OWNER.password);
	await confirm.getByRole('button', { name: 'Confirm' }).click();
	await expect(page.locator('.new-key code')).toHaveText(/^mfd_/);
	await expect(page.getByText('Memory limited to: Work')).toBeVisible();
});
