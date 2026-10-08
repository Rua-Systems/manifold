import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { withDatabase } from './database';
import { expect, signIn, test } from './fixtures';

const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64'
);

const NOTE_URL = /\/notes\/[0-9a-f-]{36}$/;

function uniqueTitle(prefix: string): string {
	return `${prefix} ${randomUUID().slice(0, 8)}`;
}

function editor(page: Page) {
	return page.getByRole('textbox', { name: 'Note content' });
}

function saveStatus(page: Page) {
	return page.locator('.status > .current');
}

function titleField(page: Page) {
	return page.getByLabel('Title', { exact: true });
}

/** Writes a new note through the editor and waits until it is saved under its own address. */
async function writeNote(page: Page, title: string, text: string): Promise<string> {
	await page.goto('/notes/new', { waitUntil: 'networkidle' });
	await titleField(page).fill(title);
	await editor(page).click();
	await page.keyboard.type(text);
	await expect(page).toHaveURL(NOTE_URL);
	await expect(saveStatus(page)).toHaveText('Saved');
	return page.url();
}

/** Saved notes open for reading; this switches the open note to writing. */
async function startEditing(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	await expect(editor(page)).toHaveAttribute('contenteditable', 'true');
}

async function appendText(page: Page, text: string): Promise<void> {
	await editor(page).click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type(text);
}

/** Moves every revision of a note back in time, so the next edit starts a new revision. */
async function ageRevisions(noteId: string, minutes: number): Promise<void> {
	await withDatabase(
		(sql) => sql`
			update note_revision
			set created_at = created_at - make_interval(mins => ${minutes})
			where note_id = ${noteId}
		`
	);
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('a new note autosaves, gets its own address and joins the sidebar', async ({
	page,
	isMobile
}) => {
	const title = uniqueTitle('Trip');
	await writeNote(page, title, 'Book the ferry');

	await appendText(page, ' and the hotel');
	await expect(saveStatus(page)).toHaveText('Saved');

	await page.reload();
	await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
	await expect(editor(page)).toContainText('Book the ferry and the hotel');

	if (isMobile) {
		await page.getByRole('button', { name: 'Open navigation' }).click();
	}
	await expect(page.locator('#appSidebar').getByRole('link', { name: title })).toHaveAttribute(
		'aria-current',
		'page'
	);
});

test('the sidebar and the notes page filter the notes', async ({ page, isMobile }) => {
	const tag = randomUUID().slice(0, 6);
	const kept = `Kept ${tag}`;
	const other = `Other ${tag}`;
	await writeNote(page, kept, 'Blue whales');
	await writeNote(page, other, 'Red pandas');

	if (isMobile) {
		await page.getByRole('button', { name: 'Open navigation' }).click();
	}
	const sidebar = page.locator('#appSidebar');
	await sidebar.getByRole('searchbox', { name: 'Filter notes' }).fill(`Kept ${tag}`);
	await expect(sidebar.getByRole('link', { name: kept })).toBeVisible();
	await expect(sidebar.getByRole('link', { name: other })).toBeHidden();
	await expect(sidebar.getByRole('link', { name: 'New Note' })).toBeVisible();

	await page.goto('/notes', { waitUntil: 'networkidle' });
	const list = page.getByRole('list', { name: 'Notes' });
	await expect(list.getByRole('link', { name: new RegExp(other) })).toBeVisible();
	await page.locator('#notesFilter').fill('whales');
	await expect(page).toHaveURL(/q=whales/);
	await expect(list.getByRole('link', { name: new RegExp(kept) })).toBeVisible();
	await expect(list.getByRole('link', { name: new RegExp(other) })).toHaveCount(0);
});

test('a saved note opens for reading and switches to writing and back', async ({ page }) => {
	const title = uniqueTitle('Reading');
	await writeNote(page, title, 'First line');
	await page.reload();

	const edit = page.getByRole('button', { name: 'Edit', exact: true });
	const toolbar = page.getByRole('toolbar', { name: 'Formatting' });
	await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
	await expect(editor(page)).toHaveAttribute('contenteditable', 'false');
	await expect(editor(page)).toHaveAttribute('aria-readonly', 'true');
	await expect(toolbar).toBeHidden();
	await expect(titleField(page)).toBeHidden();
	await expect(edit).toHaveAttribute('aria-pressed', 'false');

	await edit.click();
	await expect(edit).toHaveAttribute('aria-pressed', 'true');
	await expect(toolbar).toBeVisible();
	await expect(titleField(page)).toHaveValue(title);
	await appendText(page, ' and a second');

	await edit.click();
	await expect(saveStatus(page)).toHaveText('Saved');
	await expect(editor(page)).toHaveAttribute('contenteditable', 'false');
	await expect(editor(page)).toHaveText('First line and a second');

	await page.reload();
	await expect(editor(page)).toHaveText('First line and a second');
});

test('Ctrl+S saves at once instead of after the pause', async ({ page }) => {
	await writeNote(page, uniqueTitle('Shortcut'), 'Draft');
	await editor(page).click();
	await page.keyboard.press('ControlOrMeta+End');

	// The automatic save waits 1.5 seconds after the last key, longer than this wait.
	const saving = page.waitForRequest(
		(request) => request.method() === 'POST' && request.url().includes('?/save'),
		{ timeout: 1000 }
	);
	await page.keyboard.type('!');
	await page.keyboard.press('ControlOrMeta+s');
	await saving;
	await expect(saveStatus(page)).toHaveText('Saved');
	await expect(editor(page)).toHaveText('Draft!');
});

test('focus mode shows the editor alone and Escape leaves it', async ({ page }) => {
	await writeNote(page, uniqueTitle('Focus'), 'Quiet');

	const focus = page.getByRole('button', { name: 'Focus mode' });
	await focus.click();
	await expect(focus).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByRole('link', { name: 'All notes' })).toBeHidden();
	await expect(page.getByRole('button', { name: 'History' })).toBeHidden();
	const box = (await page.locator('.note-page').boundingBox())!;
	expect(box.x).toBe(0);
	expect(box.y).toBe(0);
	expect(box.height).toBeCloseTo(page.viewportSize()!.height, 0);

	await appendText(page, ' room');

	// Escape in the link form closes only the form.
	await page.getByRole('button', { name: 'Link', exact: true }).click();
	const address = page.getByLabel('Link address');
	await address.click();
	await page.keyboard.press('Escape');
	await expect(address).toBeHidden();
	await expect(focus).toHaveAttribute('aria-pressed', 'true');

	await page.keyboard.press('Escape');
	await expect(focus).toHaveAttribute('aria-pressed', 'false');
	await expect(page.getByRole('link', { name: 'All notes' })).toBeVisible();
	await expect(saveStatus(page)).toHaveText('Saved');
	await expect(editor(page)).toHaveText('Quiet room');
});

test('focus mode also reads, and Edit switches inside it', async ({ page }) => {
	const title = uniqueTitle('Calm');
	await writeNote(page, title, 'Calm');
	await page.reload();

	const focus = page.getByRole('button', { name: 'Focus mode' });
	const edit = page.getByRole('button', { name: 'Edit', exact: true });
	await focus.click();
	await expect(focus).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
	await expect(editor(page)).toHaveAttribute('contenteditable', 'false');
	await expect(page.getByRole('link', { name: 'All notes' })).toBeHidden();

	await edit.click();
	await expect(editor(page)).toHaveAttribute('contenteditable', 'true');
	await appendText(page, ' sea');
	await edit.click();
	await expect(saveStatus(page)).toHaveText('Saved');
	await expect(editor(page)).toHaveAttribute('contenteditable', 'false');
	await expect(focus).toHaveAttribute('aria-pressed', 'true');

	await page.keyboard.press('Escape');
	await expect(focus).toHaveAttribute('aria-pressed', 'false');
	await expect(page.getByRole('link', { name: 'All notes' })).toBeVisible();
	await expect(editor(page)).toHaveText('Calm sea');
});

test('a conflicting edit can be kept on top', async ({ page, context }) => {
	const address = await writeNote(page, uniqueTitle('Shared'), 'Original');
	const stale = await context.newPage();
	await stale.goto(address, { waitUntil: 'networkidle' });
	await startEditing(stale);

	await appendText(page, ' from here');
	await expect(saveStatus(page)).toHaveText('Saved');

	await appendText(stale, ' from there');
	const notice = stale.getByRole('alert');
	await expect(notice).toContainText('This note was changed somewhere else.');
	await expect(saveStatus(stale)).toHaveText('Conflict');

	await notice.getByRole('button', { name: 'Keep Mine' }).click();
	await expect(saveStatus(stale)).toHaveText('Saved');
	await expect(notice).toBeHidden();

	await page.reload();
	await expect(editor(page)).toHaveText('Original from there');
});

test('a conflicting edit can be dropped by reloading', async ({ page, context }) => {
	const address = await writeNote(page, uniqueTitle('Shared'), 'Original');
	const stale = await context.newPage();
	await stale.goto(address, { waitUntil: 'networkidle' });
	await startEditing(stale);

	await appendText(page, ' from here');
	await expect(saveStatus(page)).toHaveText('Saved');

	await appendText(stale, ' from there');
	const notice = stale.getByRole('alert');
	await notice.getByRole('button', { name: 'Reload' }).click();

	await expect(notice).toBeHidden();
	await expect(editor(stale)).toHaveText('Original from here');
	await expect(saveStatus(stale)).toHaveText('Saved');
});

test('the history previews an earlier version and restores it', async ({ page }) => {
	const address = await writeNote(page, uniqueTitle('Draft'), 'First draft');
	await ageRevisions(address.split('/').pop() ?? '', 10);

	await editor(page).click();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.type('Second draft');
	await expect(saveStatus(page)).toHaveText('Saved');

	await page.getByRole('button', { name: 'History' }).click();
	const history = page.getByRole('dialog', { name: 'History' });
	const versions = history.getByRole('link');
	await expect(versions).toHaveCount(2);
	await expect(versions.first()).toContainText('Owner');
	await versions.last().click();

	await expect(page.getByText(/Viewing version \d+, read only\./)).toBeVisible();
	await expect(editor(page)).toHaveText('First draft');
	await expect(editor(page)).toHaveAttribute('contenteditable', 'false');

	await page.getByRole('button', { name: 'Restore This Version' }).click();
	await expect(page.getByText('Version restored.')).toBeVisible();
	await expect(page).toHaveURL(NOTE_URL);
	await expect(editor(page)).toHaveText('First draft');
	await expect(editor(page)).toHaveAttribute('contenteditable', 'true');
});

test('a note goes to the trash, comes back and can be deleted for good', async ({ page }) => {
	const title = uniqueTitle('Temporary');
	const address = await writeNote(page, title, 'Soon gone');

	await page.getByRole('button', { name: 'Move to trash' }).click();
	await expect(page).toHaveURL(/\/notes$/);
	await expect(page.getByText('Note moved to the trash.')).toBeVisible();
	await expect(
		page.getByRole('list', { name: 'Notes' }).getByRole('link', { name: new RegExp(title) })
	).toHaveCount(0);

	await page.goto('/notes/trash', { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: `Restore ${title}` }).click();
	await expect(page.getByText('Note restored.')).toBeVisible();

	await page.goto(address, { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: 'Move to trash' }).click();
	await expect(page).toHaveURL(/\/notes$/);

	await page.goto('/notes/trash', { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: `Delete ${title} forever` }).click();
	const confirm = page.getByRole('dialog', { name: 'Delete Note' });
	await expect(confirm).toContainText(`Delete ${title} for good?`);
	await confirm.getByRole('button', { name: 'Delete Forever' }).click();
	await expect(page.getByText('Note deleted for good.')).toBeVisible();

	const response = await page.goto(address);
	expect(response?.status()).toBe(404);
});

test('an uploaded image is stored and shown in the note', async ({ page }) => {
	await page.goto('/notes/new', { waitUntil: 'networkidle' });
	await titleField(page).fill(uniqueTitle('Photo'));

	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: 'Insert image' }).click();
	await (await chooser).setFiles({ name: 'dot.png', mimeType: 'image/png', buffer: PNG });

	const image = editor(page).locator('img');
	await expect(image).toHaveAttribute('src', /^\/files\/[0-9a-f-]{36}$/);
	await expect(page).toHaveURL(NOTE_URL);
	await expect(saveStatus(page)).toHaveText('Saved');

	const source = (await image.getAttribute('src')) ?? '';
	const response = await page.request.get(source);
	expect(response.status()).toBe(200);
	expect(response.headers()['content-type']).toBe('image/png');

	await page.reload();
	await expect(editor(page).locator('img')).toHaveAttribute('src', source);
});

test('the editor toolbar keeps its buttons in one row', async ({ page, isMobile }) => {
	await page.goto('/notes/new', { waitUntil: 'networkidle' });

	const toolbar = page.getByRole('toolbar', { name: 'Formatting' });
	const first = (await toolbar.getByRole('button', { name: 'Undo' }).boundingBox())!;
	const last = (await toolbar.getByRole('button', { name: 'Insert image' }).boundingBox())!;
	expect(last.y).toBeCloseTo(first.y, 0);

	// With a mouse the whole row fits the note page; phones scroll it sideways.
	if (!isMobile) {
		const overflow = await toolbar.evaluate(
			(element) => element.scrollWidth - element.clientWidth
		);
		expect(overflow).toBeLessThanOrEqual(0);
	}
});

test('links only accept http, https and mailto', async ({ page }) => {
	await page.goto('/notes/new', { waitUntil: 'networkidle' });
	await editor(page).click();
	await page.keyboard.type('Docs');
	await page.keyboard.press('ControlOrMeta+a');

	await page.getByRole('button', { name: 'Link', exact: true }).click();
	const address = page.getByLabel('Link address');
	await address.fill('javascript:alert(1)');
	await page.getByRole('button', { name: 'Apply' }).click();
	await expect(page.locator('#editorLinkError')).toHaveText(
		'Links must start with http://, https:// or mailto:.'
	);

	await address.fill('https://example.com/docs');
	await page.getByRole('button', { name: 'Apply' }).click();
	await expect(editor(page).getByRole('link', { name: 'Docs' })).toHaveAttribute(
		'href',
		'https://example.com/docs'
	);
});

test('the server refuses content with unknown node types', async ({ page }) => {
	const response = await page.request.post('/notes/new?/create', {
		multipart: {
			title: 'Sneaky',
			content: JSON.stringify({ type: 'doc', content: [{ type: 'iframe' }] })
		},
		headers: { Origin: 'http://localhost:4173', Accept: 'text/html' }
	});

	expect(response.status()).toBe(400);
});
