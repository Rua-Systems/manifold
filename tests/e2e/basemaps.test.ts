import { withDatabase } from './database';
import { expect, signIn, test } from './fixtures';

const HOST = 'https://tiles.example.test';

test.beforeEach(async ({ page }) => {
	await signIn(page);
});

// The basemap in use applies to every map, so no test may leave one behind.
test.afterEach(async () => {
	await withDatabase((sql) => sql`delete from map_basemap`);
});

test('a basemap added in the settings shows on the map and can be switched back', async ({
	page
}) => {
	await page.goto('/settings/map', { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: 'New Basemap' }).click();
	const create = page.getByRole('dialog', { name: 'New Basemap' });
	await create.getByLabel('Name').fill('Relief');
	await create.getByLabel('Tile address').fill('http://tiles.example.test/{z}/{x}/{y}.png');
	await create.getByRole('button', { name: 'Add Basemap' }).click();
	await expect(create.locator('#basemapUrlError')).toHaveText(
		'Enter an https address with {z}, {x}, {y}.'
	);

	await create.getByLabel('Tile address').fill(`${HOST}/{z}/{x}/{y}.png`);
	await create.getByLabel('Attribution').fill('Relief tiles');
	await create.getByRole('button', { name: 'Add Basemap' }).click();
	await expect(page.getByText('Basemap added.')).toBeVisible();
	const list = page.getByRole('list', { name: 'Basemaps' });
	await expect(list).toContainText('Relief');

	await page.getByRole('button', { name: 'Use Relief' }).click();
	await expect(page.getByText('The basemap in use changed.')).toBeVisible();
	await expect(list.locator('li', { hasText: 'Relief' })).toContainText('In use');

	const reliefTile = page.waitForRequest((request) => request.url().startsWith(HOST));
	await page.goto('/notes/map', { waitUntil: 'networkidle' });
	await reliefTile;

	await page
		.getByRole('toolbar', { name: 'Map tools' })
		.getByRole('button', { name: 'Basemap' })
		.click();
	const choice = page.getByRole('dialog', { name: 'Basemap' });
	await expect(choice.getByLabel('Relief')).toBeChecked();
	const standardTile = page.waitForRequest((request) =>
		request.url().startsWith('https://tile.openstreetmap.org/')
	);
	const saved = page.waitForResponse(
		(response) => response.url().includes('?/basemap') && response.request().method() === 'POST'
	);
	await choice.getByLabel('Standard').click();
	await standardTile;
	expect((await saved).ok()).toBe(true);
	await expect(choice).toBeHidden();

	await page.goto('/settings/map', { waitUntil: 'networkidle' });
	await expect(list.locator('li', { hasText: 'Standard' })).toContainText('In use');
	await page.getByRole('button', { name: 'Delete Relief' }).click();
	await page
		.getByRole('dialog', { name: 'Delete Basemap' })
		.getByRole('button', { name: 'Delete' })
		.click();
	await expect(page.getByText('Basemap deleted.')).toBeVisible();
	await expect(
		page.getByText('No basemaps added yet. The maps show the standard one.')
	).toBeVisible();
});
