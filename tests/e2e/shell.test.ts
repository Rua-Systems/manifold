import { TEST_ORGANIZATION_NAME } from '../support/environment.ts';
import { expect, signIn, test } from './fixtures';

test('titles and the auth screen carry the organization name', async ({ page }) => {
	await page.goto('/login');

	await expect(page).toHaveTitle(`Login · ${TEST_ORGANIZATION_NAME}`);
	await expect(page.getByText(TEST_ORGANIZATION_NAME, { exact: true })).toBeVisible();
});

test('the credit links to the developer', async ({ page }) => {
	await page.goto('/login');

	const credit = page.locator('.credit').first();
	await expect(credit).toContainText('Manifold, developed by Rua Systems.');
	await expect(credit.getByRole('link')).toHaveCount(1);
	await expect(credit.getByRole('link', { name: 'Rua Systems' })).toHaveAttribute(
		'href',
		'https://rua.systems'
	);
	await expect(page.locator('meta[name="generator"]')).toHaveAttribute('content', 'Manifold');
});

test('the app shell shows the organization and the credit', async ({ page, isMobile }) => {
	await signIn(page);
	await page.goto('/settings');

	await expect(page).toHaveTitle(`Settings · ${TEST_ORGANIZATION_NAME}`);
	if (isMobile) {
		await page.getByRole('button', { name: 'Open navigation' }).click();
	}
	const sidebar = page.locator('#appSidebar');
	await expect(sidebar.getByText(TEST_ORGANIZATION_NAME)).toBeVisible();
	await expect(sidebar.getByText('Rua Systems')).toBeVisible();
	await expect(sidebar.getByRole('link', { name: 'Settings' })).toHaveAttribute(
		'aria-current',
		'page'
	);
});

test('the navigation drawer opens and closes on phones', async ({ page, isMobile }) => {
	test.skip(!isMobile, 'The drawer only exists below 768 px.');
	await signIn(page);

	const sidebar = page.locator('#appSidebar');
	await expect(sidebar).toBeHidden();

	await page.getByRole('button', { name: 'Open navigation' }).click();
	await expect(sidebar).toBeVisible();
	// The drawer covers the middle of the backdrop behind it; tap the uncovered right edge.
	const backdrop = page.getByRole('button', { name: 'Close navigation' }).first();
	const box = await backdrop.boundingBox();
	await backdrop.click({ position: { x: (box?.width ?? 1) - 8, y: (box?.height ?? 1) / 2 } });
	await expect(sidebar).toBeHidden();

	await page.getByRole('button', { name: 'Open navigation' }).click();
	await page.keyboard.press('Escape');
	await expect(sidebar).toBeHidden();

	await page.getByRole('button', { name: 'Open navigation' }).click();
	await sidebar.getByRole('link', { name: 'Settings' }).click();
	await expect(page).toHaveURL(/\/settings$/);
	await expect(sidebar).toBeHidden();
});

test('the sidebar collapses to icons on desktop', async ({ page, isMobile }) => {
	test.skip(isMobile, 'Phones use the drawer instead.');
	await signIn(page);

	const sidebar = page.locator('#appSidebar');
	const label = sidebar.locator('.label').first();
	await expect(label).toHaveCSS('opacity', '1');

	await page.getByRole('button', { name: 'Collapse sidebar' }).click();
	await expect(label).toHaveCSS('opacity', '0');
	await page.getByRole('button', { name: 'Expand sidebar' }).click();
	await expect(label).toHaveCSS('opacity', '1');
});

test('touch targets in the shell are at least 44 px', async ({ page, isMobile }) => {
	test.skip(!isMobile, 'Checked where touch is the input.');
	await signIn(page);

	for (const name of ['Open navigation', 'Account menu']) {
		const box = await page.getByRole('button', { name }).boundingBox();
		expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
		expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
	}
});

test('the sidebar keeps the width its edge is dragged to', async ({ page, isMobile }) => {
	test.skip(isMobile, 'The drawer keeps its own width on phones.');
	await signIn(page);

	const sidebar = page.locator('#appSidebar');
	const edge = page.getByRole('separator', { name: 'Sidebar width' });
	await expect(edge).toHaveAttribute('aria-valuenow', '256');

	const box = await edge.boundingBox();
	const x = (box?.x ?? 0) + (box?.width ?? 0) / 2;
	const y = (box?.y ?? 0) + (box?.height ?? 0) / 2;
	const dragged = page.waitForResponse((response) => response.url().includes('/sidebar?/width'));
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x + 60, y, { steps: 4 });
	await page.mouse.move(x + 120, y, { steps: 4 });
	await page.mouse.up();
	expect((await dragged).ok()).toBe(true);
	const width = Number(await edge.getAttribute('aria-valuenow'));
	expect(width).toBeGreaterThanOrEqual(370);
	expect(width).toBeLessThanOrEqual(380);

	// The width comes from the database, so a fresh page opens just as wide.
	await page.reload();
	await expect
		.poll(async () => Math.round((await sidebar.boundingBox())?.width ?? 0))
		.toBe(width);

	// Dragging beyond the limits stops at them.
	const far = page.waitForResponse((response) => response.url().includes('/sidebar?/width'));
	const edgeBox = await edge.boundingBox();
	const edgeX = (edgeBox?.x ?? 0) + (edgeBox?.width ?? 0) / 2;
	await page.mouse.move(edgeX, y);
	await page.mouse.down();
	await page.mouse.move(edgeX + 600, y, { steps: 6 });
	await page.mouse.up();
	await far;
	await expect(edge).toHaveAttribute('aria-valuenow', '500');

	// The keyboard moves the edge too, and saves once the keys stop.
	const typed = page.waitForResponse((response) => response.url().includes('/sidebar?/width'));
	await edge.focus();
	await page.keyboard.press('Home');
	await expect(edge).toHaveAttribute('aria-valuenow', '200');
	await page.keyboard.press('ArrowRight');
	await expect(edge).toHaveAttribute('aria-valuenow', '216');
	await typed;
	await page.reload();
	await expect(edge).toHaveAttribute('aria-valuenow', '216');

	// A double click goes back to the default width.
	const reset = page.waitForResponse((response) => response.url().includes('/sidebar?/width'));
	await edge.dblclick();
	await reset;
	await expect(edge).toHaveAttribute('aria-valuenow', '256');
	await page.reload();
	await expect.poll(async () => Math.round((await sidebar.boundingBox())?.width ?? 0)).toBe(256);
});

test('the sidebar edge is gone while the sidebar is collapsed', async ({ page, isMobile }) => {
	test.skip(isMobile, 'Phones use the drawer instead.');
	await signIn(page);

	await expect(page.getByRole('separator', { name: 'Sidebar width' })).toBeVisible();
	await page.getByRole('button', { name: 'Collapse sidebar' }).click();
	await expect(page.getByRole('separator', { name: 'Sidebar width' })).toHaveCount(0);
	await page.getByRole('button', { name: 'Expand sidebar' }).click();
	await expect(page.getByRole('separator', { name: 'Sidebar width' })).toBeVisible();
});
