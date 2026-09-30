import { TEST_ORGANIZATION_NAME } from '../support/environment.ts';
import { expect, signIn, test } from './fixtures';

test('titles and the auth screen carry the organization name', async ({ page }) => {
	await page.goto('/login');

	await expect(page).toHaveTitle(`Login · ${TEST_ORGANIZATION_NAME}`);
	await expect(page.getByText(TEST_ORGANIZATION_NAME, { exact: true })).toBeVisible();
});

test('the credit links to the developer and the author', async ({ page }) => {
	await page.goto('/login');

	const credit = page.locator('.credit').first();
	await expect(credit).toContainText('Manifold, developed by Rua Systems and Hasan.');
	await expect(credit.getByRole('link', { name: 'Rua Systems' })).toHaveAttribute(
		'href',
		'https://rua.systems'
	);
	await expect(credit.getByRole('link', { name: 'Hasan' })).toHaveAttribute(
		'href',
		'https://github.com/justhasanuknow'
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
	await page.getByRole('button', { name: 'Close navigation' }).first().click();
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
