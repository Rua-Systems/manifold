import { withDatabase } from './database';
import { expect, signIn, test } from './fixtures';

test.beforeEach(async ({ page }) => {
	await withDatabase((sql) => sql`delete from tag`);
	await signIn(page);
});

test('tags are added, renamed, recolored and deleted in the settings', async ({ page }) => {
	await page.goto('/settings/tags', { waitUntil: 'networkidle' });
	await expect(page.getByText('No tags yet.')).toBeVisible();

	await page.getByRole('button', { name: 'New Tag' }).click();
	const create = page.getByRole('dialog', { name: 'New Tag' });
	await create.getByRole('button', { name: 'Add Tag' }).click();
	await expect(create.locator('#tagNameError')).toHaveText('This field is required.');

	await create.getByLabel('Name').fill('Atlas');
	await create.getByLabel('Teal').check();
	await create.getByRole('button', { name: 'Add Tag' }).click();
	await expect(page.getByText('Tag added.')).toBeVisible();
	const list = page.getByRole('list', { name: 'Tags' });
	await expect(list).toContainText('Atlas');

	await page.getByRole('button', { name: 'New Tag' }).click();
	await create.getByLabel('Name').fill('atlas');
	await create.getByRole('button', { name: 'Add Tag' }).click();
	await expect(create.locator('#tagNameError')).toHaveText('A tag already has this name.');
	await create.getByRole('button', { name: 'Close' }).click();

	await page.getByRole('button', { name: 'Edit Atlas' }).click();
	const edit = page.getByRole('dialog', { name: 'Edit Tag' });
	await expect(edit.getByLabel('Teal')).toBeChecked();
	await edit.getByLabel('Name').fill('Atlas Project');
	await edit.getByLabel('Amber').check();
	await edit.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Tag saved.')).toBeVisible();
	await expect(list).toContainText('Atlas Project');

	await page.getByRole('button', { name: 'Delete Atlas Project' }).click();
	const confirm = page.getByRole('dialog', { name: 'Delete Tag' });
	await expect(confirm).toContainText('Everything tagged with it loses the tag.');
	await confirm.getByRole('button', { name: 'Delete' }).click();
	await expect(page.getByText('Tag deleted.')).toBeVisible();
	await expect(page.getByText('No tags yet.')).toBeVisible();
});
