import type { Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { expect, signIn, test } from './fixtures';

function palette(page: Page) {
	return page.getByRole('dialog', { name: 'Commands' });
}

function input(page: Page) {
	return palette(page).getByRole('combobox', { name: 'Search or type a command' });
}

async function openPalette(page: Page, isMobile: boolean): Promise<void> {
	if (isMobile) {
		await page
			.locator('.topbar')
			.getByRole('button', { name: 'Search and commands (Ctrl+K)' })
			.click();
	} else {
		await page
			.locator('#appSidebar')
			.getByRole('button', { name: 'Search and commands (Ctrl+K)' })
			.click();
	}
	await expect(palette(page)).toBeVisible();
	await expect(input(page)).toBeFocused();
}

/** A note whose title and text both carry a word no other test uses. */
async function writeNote(page: Page, title: string, text: string): Promise<void> {
	await page.goto('/notes/new', { waitUntil: 'networkidle' });
	await page.getByLabel('Title', { exact: true }).fill(title);
	await page.getByRole('textbox', { name: 'Note content' }).click();
	await page.keyboard.type(text);
	await expect(page.locator('.status > .current')).toHaveText('Saved');
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('Ctrl+K opens the palette and Enter runs the highlighted command', async ({
	page,
	isMobile
}) => {
	test.skip(isMobile, 'Phones have no keyboard shortcut; the search button covers them.');
	await page.keyboard.press('Control+k');
	await expect(palette(page)).toBeVisible();

	await input(page).fill('security');
	await expect(palette(page).getByRole('option').first()).toHaveText(/Go to Security/);
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/settings\/security$/);
	await expect(palette(page)).toBeHidden();
});

test('arrow keys move through the options', async ({ page, isMobile }) => {
	test.skip(isMobile, 'Keyboard navigation is a desktop concern.');
	await page.keyboard.press('Control+k');
	await input(page).fill('go to');

	const options = palette(page).getByRole('option');
	await expect(options.first()).toHaveAttribute('aria-selected', 'true');
	await page.keyboard.press('ArrowDown');
	await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
	await expect(input(page)).toHaveAttribute('aria-activedescendant', 'paletteOption1');
	await page.keyboard.press('ArrowUp');
	await page.keyboard.press('ArrowUp');
	await expect(options.last()).toHaveAttribute('aria-selected', 'true');

	await page.keyboard.press('Escape');
	await expect(palette(page)).toBeHidden();
});

test('the search button opens the palette, which searches notes', async ({ page, isMobile }) => {
	const word = `palette${randomUUID().slice(0, 6)}`;
	await writeNote(page, `Found ${word}`, `Somewhere in the text: ${word}.`);

	await openPalette(page, isMobile);
	await input(page).fill(word);
	const result = palette(page).getByRole('option', { name: new RegExp(`Found ${word}`) });
	await expect(result).toBeVisible();
	await result.click();
	await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
	await expect(page.getByRole('heading', { level: 1, name: `Found ${word}` })).toBeVisible();
});

test('services open in a new tab from the palette', async ({ page, context, isMobile }) => {
	const alias = `Pal${randomUUID().slice(0, 6)}`;
	await context.route('https://palette.example.test/**', (route) =>
		route.fulfill({ contentType: 'text/html', body: '<title>Service</title>' })
	);
	await page.goto('/services', { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: 'New Service' }).click();
	const dialog = page.getByRole('dialog', { name: 'New Service' });
	await dialog.getByLabel('Alias').fill(alias);
	await dialog.getByLabel('URL').fill('https://palette.example.test/');
	await dialog.getByRole('button', { name: 'Add Service' }).click();
	await expect(page.getByText('Service added.')).toBeVisible();

	await openPalette(page, isMobile);
	await input(page).fill(alias);
	const popup = page.waitForEvent('popup');
	await palette(page)
		.getByRole('option', { name: new RegExp(alias) })
		.first()
		.click();
	expect((await popup).url()).toBe('https://palette.example.test/');
});

test('actions run from the palette: theme and new service', async ({ page, isMobile }) => {
	await page.goto('/services', { waitUntil: 'networkidle' });
	const before = await page.locator('html').getAttribute('data-theme');

	await openPalette(page, isMobile);
	await input(page).fill('theme');
	await palette(page)
		.getByRole('option', { name: /Toggle light and dark theme/ })
		.click();
	await expect(page.locator('html')).toHaveAttribute(
		'data-theme',
		before === 'dark' ? 'light' : 'dark'
	);

	await openPalette(page, isMobile);
	await input(page).fill('new service');
	await palette(page)
		.getByRole('option', { name: /New Service/ })
		.click();
	await expect(page.getByRole('dialog', { name: 'New Service' })).toBeVisible();
});

test('the sidebar and the notes page filters find text inside notes', async ({
	page,
	isMobile
}) => {
	const word = `filter${randomUUID().slice(0, 6)}`;
	const title = `Hidden ${randomUUID().slice(0, 6)}`;
	await writeNote(page, title, `The word ${word} is only in the text.`);

	if (isMobile) {
		await page.getByRole('button', { name: 'Open navigation' }).click();
	}
	const sidebar = page.locator('#appSidebar');
	await sidebar.getByRole('searchbox', { name: 'Filter notes' }).fill(word);
	await expect(sidebar.getByRole('link', { name: title })).toBeVisible();

	await page.goto(`/notes?q=${word}`, { waitUntil: 'networkidle' });
	await expect(
		page.getByRole('list', { name: 'Notes' }).getByRole('link', { name: new RegExp(title) })
	).toBeVisible();

	await page.goto(`/search?q=${word}`, { waitUntil: 'networkidle' });
	await expect(
		page.getByRole('list', { name: 'Search results' }).getByRole('link', { name: title })
	).toBeVisible();
});

test('the palette leads to the data settings', async ({ page, isMobile }) => {
	await openPalette(page, isMobile);
	await input(page).fill('data');
	await palette(page)
		.getByRole('option', { name: /Go to Data/ })
		.click();
	await expect(page).toHaveURL(/\/settings\/data$/);
});

test('every result of a palette search opens on the search page', async ({ page, isMobile }) => {
	const word = `every${randomUUID().slice(0, 6)}`;
	const title = `All ${word}`;
	await writeNote(page, title, `Written for ${word}.`);

	await openPalette(page, isMobile);
	await input(page).fill(word);
	await palette(page)
		.getByRole('option', { name: `All results for “${word}”` })
		.click();
	await expect(page).toHaveURL(new RegExp(`/search\\?q=${word}$`));
	await expect(
		page.getByRole('list', { name: 'Search results' }).getByRole('link', { name: title })
	).toBeVisible();
});
