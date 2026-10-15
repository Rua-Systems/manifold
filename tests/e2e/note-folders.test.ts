import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { expect, signIn, test } from './fixtures';

const NOTE_URL = /\/notes\/[0-9a-f-]{36}$/;
const FOLDER_URL = /\/notes\?folder=[0-9a-f-]{36}$/;

function unique(prefix: string): string {
	return `${prefix} ${randomUUID().slice(0, 8)}`;
}

function folderRow(page: Page, name: string) {
	return page
		.getByRole('list', { name: 'Folders' })
		.getByRole('listitem')
		.filter({ hasText: name });
}

async function createFolder(page: Page, name: string): Promise<void> {
	await page.getByRole('button', { name: 'New Folder' }).click();
	const dialog = page.getByRole('dialog', { name: 'New Folder' });
	await dialog.getByLabel('Folder name').fill(name);
	await dialog.getByRole('button', { name: 'Create' }).click();
	await expect(dialog).toBeHidden();
	await expect(folderRow(page, name)).toBeVisible();
}

/** The sidebar, opened first on phones. */
async function sidebar(page: Page, isMobile: boolean) {
	if (isMobile) {
		await page.getByRole('button', { name: 'Open navigation' }).click();
	}
	return page.locator('#appSidebar');
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('a note is written inside a folder and shows it on its page and in the sidebar', async ({
	page,
	isMobile
}) => {
	const folder = unique('Projects');
	const title = unique('Ferry plan');
	await page.goto('/notes', { waitUntil: 'networkidle' });
	await createFolder(page, folder);

	await folderRow(page, folder).getByRole('link').click();
	await expect(page).toHaveURL(FOLDER_URL);
	await expect(page.getByRole('heading', { level: 1, name: folder })).toBeVisible();
	await expect(page.getByText('This folder is empty.')).toBeVisible();

	// The sidebar has a New Note of its own, at the top level.
	await page.locator('section').getByRole('link', { name: 'New Note' }).click();
	await page.getByLabel('Title', { exact: true }).fill(title);
	await page.getByRole('textbox', { name: 'Note content' }).click();
	await page.keyboard.type('Leave at nine');
	await expect(page).toHaveURL(NOTE_URL);
	await expect(page.locator('.status > .current')).toHaveText('Saved');

	const crumbs = page.getByRole('navigation', { name: 'Folder' });
	await expect(crumbs.getByRole('link', { name: folder })).toBeVisible();
	await crumbs.getByRole('link', { name: folder }).click();
	await expect(page).toHaveURL(FOLDER_URL);
	await expect(
		page.getByRole('list', { name: 'Notes' }).getByRole('link', { name: new RegExp(title) })
	).toBeVisible();

	// The folder holding the open note opens by itself in the sidebar.
	await page
		.getByRole('list', { name: 'Notes' })
		.getByRole('link', { name: new RegExp(title) })
		.click();
	await expect(page).toHaveURL(NOTE_URL);
	const nav = await sidebar(page, isMobile);
	await expect(nav.getByRole('button', { name: `Close ${folder}` })).toBeVisible();
	await expect(nav.getByRole('link', { name: title })).toBeVisible();
	await nav.getByRole('button', { name: `Close ${folder}` }).click();
	await expect(nav.getByRole('link', { name: title })).toBeHidden();
	await nav.getByRole('button', { name: `Open ${folder}` }).click();
	await expect(nav.getByRole('link', { name: title })).toBeVisible();
});

test('a note moves between folders from its page', async ({ page }) => {
	const folder = unique('Archive');
	const title = unique('Receipt');
	await page.goto('/notes', { waitUntil: 'networkidle' });
	await createFolder(page, folder);

	await page.goto('/notes/new', { waitUntil: 'networkidle' });
	await page.getByLabel('Title', { exact: true }).fill(title);
	await page.getByRole('textbox', { name: 'Note content' }).click();
	await page.keyboard.type('Paid');
	await expect(page).toHaveURL(NOTE_URL);
	await expect(page.locator('.status > .current')).toHaveText('Saved');
	await expect(page.getByRole('link', { name: 'All notes' })).toBeVisible();

	await page.getByRole('button', { name: 'Move to Folder' }).click();
	const dialog = page.getByRole('dialog', { name: `Move "${title}"` });
	await dialog.getByText(folder, { exact: true }).click();
	await dialog.getByRole('button', { name: 'Move' }).click();
	await expect(dialog).toBeHidden();
	await expect(page.getByText('Note moved.')).toBeVisible();
	await expect(
		page.getByRole('navigation', { name: 'Folder' }).getByRole('link', { name: folder })
	).toBeVisible();

	// Back to the top level.
	await page.getByRole('button', { name: 'Move to Folder' }).click();
	await dialog.getByText('Notes', { exact: true }).click();
	await dialog.getByRole('button', { name: 'Move' }).click();
	await expect(dialog).toBeHidden();
	await expect(page.getByRole('link', { name: 'All notes' })).toBeVisible();
});

test('folders nest, rename and delete only when empty', async ({ page }) => {
	const outer = unique('Work');
	const inner = unique('Clients');
	await page.goto('/notes', { waitUntil: 'networkidle' });
	await createFolder(page, outer);
	await createFolder(page, inner);

	// A second folder of the same name in the same place is refused.
	await page.getByRole('button', { name: 'New Folder' }).click();
	const create = page.getByRole('dialog', { name: 'New Folder' });
	await create.getByLabel('Folder name').fill(outer.toUpperCase());
	await create.getByRole('button', { name: 'Create' }).click();
	await expect(create.getByText('A folder here already has this name.')).toBeVisible();
	await create.getByRole('button', { name: 'Close' }).click();

	await folderRow(page, inner)
		.getByRole('button', { name: `Move folder ${inner}` })
		.click();
	const move = page.getByRole('dialog', { name: `Move "${inner}"` });
	await move.getByText(outer, { exact: true }).click();
	await move.getByRole('button', { name: 'Move' }).click();
	await expect(move).toBeHidden();
	await expect(folderRow(page, inner)).toHaveCount(0);

	const deleteOuter = folderRow(page, outer).getByRole('button', {
		name: `Delete folder ${outer}`
	});
	await expect(deleteOuter).toBeDisabled();

	await folderRow(page, outer).getByRole('link').click();
	await expect(page).toHaveURL(FOLDER_URL);
	const renamed = unique('Customers');
	await folderRow(page, inner)
		.getByRole('button', { name: `Rename folder ${inner}` })
		.click();
	const rename = page.getByRole('dialog', { name: 'Rename folder' });
	await rename.getByLabel('Folder name').fill(renamed);
	await rename.getByRole('button', { name: 'Save' }).click();
	await expect(folderRow(page, renamed)).toBeVisible();

	await folderRow(page, renamed)
		.getByRole('button', { name: `Delete folder ${renamed}` })
		.click();
	const confirm = page.getByRole('dialog', { name: 'Delete folder' });
	await confirm.getByRole('button', { name: 'Delete' }).click();
	await expect(page.getByText('Folder deleted.')).toBeVisible();
	await expect(folderRow(page, renamed)).toHaveCount(0);

	await page
		.getByRole('navigation', { name: 'Folder' })
		.getByRole('link', { name: 'Notes' })
		.click();
	await expect(deleteOuter).toBeEnabled();
});

test('a note is dragged onto a folder', async ({ page, isMobile }) => {
	test.skip(isMobile, 'Dragging is for a mouse.');
	const folder = unique('Dropped');
	const title = unique('Dragged');
	await page.goto('/notes/new', { waitUntil: 'networkidle' });
	await page.getByLabel('Title', { exact: true }).fill(title);
	await page.getByRole('textbox', { name: 'Note content' }).click();
	await page.keyboard.type('Moving');
	await expect(page).toHaveURL(NOTE_URL);
	await expect(page.locator('.status > .current')).toHaveText('Saved');

	await page.goto('/notes', { waitUntil: 'networkidle' });
	await createFolder(page, folder);
	const noteItem = page
		.getByRole('list', { name: 'Notes' })
		.getByRole('listitem')
		.filter({ hasText: title });
	await noteItem.dragTo(folderRow(page, folder));
	await expect(page.getByText('Note moved.')).toBeVisible();
	await expect(noteItem).toHaveCount(0);

	await folderRow(page, folder).getByRole('link').click();
	await expect(
		page.getByRole('list', { name: 'Notes' }).getByRole('link', { name: new RegExp(title) })
	).toBeVisible();
});
