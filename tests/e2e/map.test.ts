import type { Page } from '@playwright/test';
import { randomInt, randomUUID } from 'node:crypto';
import { expect, signIn, test } from './fixtures';

// Drawing goes through synthetic pointer events on the map's viewport, on desktop and on phones.
// Every test opens the map over its own random spot, so geometries from other tests never lie
// under its pointer or snap its drawings.

const NOTE_URL = /\/notes\/[0-9a-f-]{36}$/;

function uniqueTitle(prefix: string): string {
	return `${prefix} ${randomUUID().slice(0, 8)}`;
}

function mapElement(page: Page) {
	return page.getByTestId('map');
}

function viewport(page: Page) {
	return mapElement(page).locator('.ol-viewport');
}

function panel(page: Page, name: string) {
	return page.getByRole('complementary', { name });
}

async function openMap(page: Page, path = '/notes/map'): Promise<void> {
	const view = {
		center: [randomInt(-170_000, 170_000) / 1000, randomInt(-60_000, 60_000) / 1000],
		zoom: 17
	};
	await page.addInitScript((saved) => {
		localStorage.setItem('manifold.map.view', JSON.stringify(saved));
	}, view);
	await page.goto(path, { waitUntil: 'networkidle' });
	await expect(mapElement(page)).toHaveAttribute('data-map-ready', 'true');
}

/** A tap or click at `(x, y)` inside the map, as a pointer down and up. */
async function tap(page: Page, isMobile: boolean, x: number, y: number): Promise<void> {
	const box = await viewport(page).boundingBox();
	if (box === null) {
		throw new Error('The map is not visible.');
	}
	const init = {
		clientX: box.x + x,
		clientY: box.y + y,
		pointerId: 1,
		pointerType: isMobile ? 'touch' : 'mouse',
		isPrimary: true,
		button: 0
	};
	await viewport(page).dispatchEvent('pointerdown', { ...init, buttons: 1 });
	await viewport(page).dispatchEvent('pointerup', { ...init, buttons: 0 });
}

async function tool(page: Page, name: string): Promise<void> {
	await page.getByRole('toolbar', { name: 'Map tools' }).getByRole('button', { name }).click();
}

function saveStatus(page: Page) {
	return page.locator('.status > .current');
}

/** Drops a pin and makes it a new note with the given title, edited in the panel. */
async function pinNewNote(page: Page, isMobile: boolean, title: string): Promise<void> {
	await tool(page, 'Drop a pin');
	await tap(page, isMobile, 160, 160);
	const pending = panel(page, 'New Location');
	await expect(pending).toBeVisible();
	await pending.getByRole('button', { name: 'New Note' }).click();

	const location = panel(page, 'Location');
	await expect(location.getByRole('textbox', { name: 'Note content' })).toBeVisible();
	await location.getByLabel('Title', { exact: true }).fill(title);
	await location.getByRole('textbox', { name: 'Note content' }).click();
	await page.keyboard.type('Written on the map');
	await expect(saveStatus(page)).toHaveText('Saved');
}

async function writeNote(page: Page, title: string): Promise<string> {
	await page.goto('/notes/new', { waitUntil: 'networkidle' });
	await page.getByLabel('Title', { exact: true }).fill(title);
	await page.getByRole('textbox', { name: 'Note content' }).click();
	await page.keyboard.type('Somewhere');
	await expect(page).toHaveURL(NOTE_URL);
	await expect(saveStatus(page)).toHaveText('Saved');
	return page.url();
}

async function featureCount(page: Page): Promise<number> {
	return Number(await mapElement(page).getAttribute('data-feature-count'));
}

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

test('a dropped pin becomes a new note, edited in the panel', async ({ page, isMobile }) => {
	const title = uniqueTitle('Pin');
	await openMap(page);
	const before = await featureCount(page);
	await pinNewNote(page, isMobile, title);
	await expect(mapElement(page)).toHaveAttribute('data-feature-count', String(before + 1));

	await panel(page, 'Location').getByRole('link', { name: 'Open as Page' }).click();
	await expect(page).toHaveURL(NOTE_URL);
	await expect(page.getByLabel('Title', { exact: true })).toHaveValue(title);
	await expect(page.getByRole('textbox', { name: 'Note content' })).toHaveText(
		'Written on the map'
	);
	await expect(page.getByTestId('note-location-map')).toBeVisible();
	await expect(page.getByRole('link', { name: 'Show on Map' })).toBeVisible();
});

test('a polygon can be linked to an existing note', async ({ page, isMobile }) => {
	const title = uniqueTitle('Field');
	const address = await writeNote(page, title);
	await openMap(page);

	await tool(page, 'Draw a polygon');
	await tap(page, isMobile, 100, 120);
	await tap(page, isMobile, 260, 120);
	await tap(page, isMobile, 260, 260);
	await tap(page, isMobile, 100, 120);

	const pending = panel(page, 'New Location');
	await pending.getByRole('button', { name: 'Link to Existing Note' }).click();
	await pending.getByRole('searchbox', { name: 'Find a note' }).fill(title);
	await pending.getByRole('button', { name: title }).click();

	const location = panel(page, 'Location');
	await expect(location.getByLabel('Title', { exact: true })).toHaveValue(title);
	await expect(location).toContainText('Polygon');

	await page.goto(address, { waitUntil: 'networkidle' });
	await expect(page.getByTestId('note-location-map')).toBeVisible();
});

test('selecting a geometry opens its note; unlinking it keeps the note', async ({
	page,
	isMobile
}) => {
	const title = uniqueTitle('Kept');
	await openMap(page);
	await pinNewNote(page, isMobile, title);
	await panel(page, 'Location').getByRole('button', { name: 'Close' }).click();
	await expect(panel(page, 'Location')).toBeHidden();

	await tool(page, 'Select');
	await tap(page, isMobile, 160, 160);
	const location = panel(page, 'Location');
	await expect(location.getByLabel('Title', { exact: true })).toHaveValue(title);

	const before = await featureCount(page);
	await location.getByRole('button', { name: 'Unlink and Delete This Geometry' }).click();
	const confirm = page.getByRole('dialog', { name: 'Delete Geometry' });
	await confirm.getByRole('button', { name: 'Delete' }).click();
	await expect(page.getByText('Geometry deleted.')).toBeVisible();
	await expect(mapElement(page)).toHaveAttribute('data-feature-count', String(before - 1));
	await expect(panel(page, 'Location')).toBeHidden();

	await page.goto(`/notes?q=${encodeURIComponent(title)}`, { waitUntil: 'networkidle' });
	await expect(
		page.getByRole('list', { name: 'Notes' }).getByRole('link', { name: new RegExp(title) })
	).toBeVisible();
});

test('trashing a note hides its geometries until it is restored', async ({ page, isMobile }) => {
	const title = uniqueTitle('Hidden');
	await openMap(page);
	const before = await featureCount(page);
	await pinNewNote(page, isMobile, title);

	await panel(page, 'Location').getByRole('button', { name: 'Move to trash' }).click();
	await expect(page.getByText('Note moved to the trash.')).toBeVisible();
	await expect(panel(page, 'Location')).toBeHidden();
	await expect(mapElement(page)).toHaveAttribute('data-feature-count', String(before));

	await page.goto('/notes/trash', { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: `Restore ${title}` }).click();
	await expect(page.getByText('Note restored.')).toBeVisible();

	await openMap(page);
	await expect(mapElement(page)).toHaveAttribute('data-feature-count', String(before + 1));
});

test('Add Location on the note page links the next geometry to that note', async ({
	page,
	isMobile
}) => {
	const title = uniqueTitle('Attached');
	const address = await writeNote(page, title);
	await expect(page.getByText('This note has no location yet.')).toBeVisible();

	const attachUrl = await page.getByRole('link', { name: 'Add Location' }).getAttribute('href');
	await openMap(page, attachUrl ?? '');
	await expect(page.getByText(`Draw a location for ${title}.`)).toBeVisible();

	await tool(page, 'Drop a pin');
	await tap(page, isMobile, 180, 180);
	const location = panel(page, 'Location');
	await expect(location.getByLabel('Title', { exact: true })).toHaveValue(title);
	await expect(page.getByText(`Draw a location for ${title}.`)).toBeHidden();
	await expect(page).toHaveURL(/\/notes\/map$/);

	await page.goto(address, { waitUntil: 'networkidle' });
	await page.getByRole('link', { name: 'Show on Map' }).click();
	await expect(page).toHaveURL(/\/notes\/map\?note=/);
	await expect(panel(page, 'Location').getByLabel('Title', { exact: true })).toHaveValue(title);
});

test('undo removes the last point and Escape cancels the drawing', async ({ page, isMobile }) => {
	test.skip(isMobile, 'Escape needs a keyboard; phones use the cancel button.');
	await openMap(page);
	const undo = page.getByRole('button', { name: 'Undo last point' });
	await expect(undo).toBeDisabled();

	await tool(page, 'Draw a line');
	await tap(page, false, 120, 140);
	await tap(page, false, 240, 140);
	await expect(undo).toBeEnabled();
	await undo.click();
	await expect(undo).toBeEnabled();

	await page.keyboard.press('Escape');
	await expect(undo).toBeDisabled();
	await expect(panel(page, 'New Location')).toBeHidden();
});

test('the cancel button ends a drawing on phones', async ({ page, isMobile }) => {
	test.skip(!isMobile, 'Covered with Escape on desktop.');
	await openMap(page);
	await tool(page, 'Draw a line');
	await tap(page, true, 120, 140);
	await page.getByRole('button', { name: 'Cancel drawing' }).click();
	await expect(page.getByRole('button', { name: 'Undo last point' })).toBeDisabled();
});

test('the toolbar and panel sit where each screen size expects', async ({ page, isMobile }) => {
	await openMap(page);
	await tool(page, 'Drop a pin');
	await tap(page, isMobile, 160, 160);
	const pending = panel(page, 'New Location');
	await expect(pending).toBeVisible();

	const map = (await mapElement(page).boundingBox())!;
	const toolbar = (await page.getByRole('toolbar', { name: 'Map tools' }).boundingBox())!;
	const sheet = (await pending.boundingBox())!;
	const screen = page.viewportSize()!;
	// The page keeps a scrollbar gutter, so its width can be less than the viewport's.
	const pageWidth = await page.evaluate(() => document.body.getBoundingClientRect().width);

	if (isMobile) {
		expect(toolbar.y + toolbar.height).toBeGreaterThan(screen.height - 8);
		expect(sheet.width).toBeGreaterThan(pageWidth - 2);
		expect(sheet.y + sheet.height).toBeLessThanOrEqual(toolbar.y + 1);

		const half = sheet.height;
		await pending.getByRole('button', { name: 'Expand the panel' }).click();
		await expect
			.poll(async () => (await pending.boundingBox())?.height ?? 0)
			.toBeGreaterThan(half + 50);
	} else {
		expect(toolbar.y).toBeLessThan(map.y + 40);
		expect(toolbar.x).toBeLessThan(map.x + 40);
		expect(sheet.x).toBeGreaterThanOrEqual(map.x + map.width - 1);
		expect(sheet.x + sheet.width).toBeGreaterThan(pageWidth - 2);
	}
});
