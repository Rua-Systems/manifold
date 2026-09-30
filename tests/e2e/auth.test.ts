import { TEST_OWNER } from '../support/owner.ts';
import { expect, signIn, test } from './fixtures';

test('the owner signs in with the username', async ({ page }) => {
	await signIn(page, TEST_OWNER.username);

	await expect(page.getByRole('heading', { level: 1, name: 'Services' })).toBeVisible();
});

test('the owner signs in with the email address', async ({ page }) => {
	await signIn(page, TEST_OWNER.email.toUpperCase());

	await expect(page).toHaveURL(/\/services$/);
});

test('a wrong password is refused without saying which part was wrong', async ({ page }) => {
	await page.goto('/login', { waitUntil: 'networkidle' });
	await page.getByLabel('Username or Email').fill(TEST_OWNER.username);
	await page.getByLabel('Password', { exact: true }).fill('not the password');
	await page.getByRole('button', { name: 'Authenticate' }).click();

	await expect(page.getByText('Those credentials were not accepted.')).toBeVisible();
	await expect(page).toHaveURL(/\/login$/);
});

test('sign in attempts are rate limited per client', async ({ page }) => {
	await page.goto('/login', { waitUntil: 'networkidle' });
	for (let attempt = 0; attempt < 6; attempt += 1) {
		await page.getByLabel('Username or Email').fill(TEST_OWNER.username);
		await page.getByLabel('Password', { exact: true }).fill('wrong password');
		await Promise.all([
			page.waitForResponse((response) => response.request().method() === 'POST'),
			page.getByRole('button', { name: 'Authenticate' }).click()
		]);
	}

	await expect(page.getByText('Too many attempts. Wait a minute and try again.')).toBeVisible();
});

test('login rejects a malformed identifier before submitting', async ({ page }) => {
	await page.goto('/login', { waitUntil: 'networkidle' });
	await page.getByLabel('Username or Email').fill('owner@');
	await page.getByLabel('Password', { exact: true }).fill('secret');
	await page.getByRole('button', { name: 'Authenticate' }).click();

	await expect(page.locator('#loginIdentifierError')).toHaveText(
		'Enter a valid username or email address.'
	);
});

test('email features are hidden without SMTP', async ({ page, request }) => {
	await page.goto('/login');

	await expect(page.getByRole('button', { name: 'Email Code' })).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Forgot Password' })).toHaveCount(0);

	expect((await request.get('/forgot-password')).status()).toBe(404);
	const codeRequest = await request.post('/login?/requestCode', {
		form: { email: TEST_OWNER.email },
		headers: { Origin: 'http://localhost:4173' }
	});
	expect(codeRequest.status()).toBe(404);
});

test('the root sends guests to sign in and the owner to services', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/login$/);

	await signIn(page);
	await page.goto('/');
	await expect(page).toHaveURL(/\/services$/);
});

test('old dashboard links land on services', async ({ page }) => {
	await page.goto('/dashboard/map-notes');
	await expect(page).toHaveURL(/\/login\?redirectTo=%2Fservices$/);

	await signIn(page);
	for (const path of ['/dashboard', '/dashboard/map-notes']) {
		await page.goto(path);
		await expect(page).toHaveURL(/\/services$/);
	}

	await page.goto('/tr/dashboard');
	await expect(page).toHaveURL(/\/tr\/services$/);
});

test('protected pages send guests to sign in and back afterwards', async ({ page }) => {
	await page.goto('/settings');
	await expect(page).toHaveURL(/\/login\?redirectTo=%2Fsettings$/);

	await page.getByLabel('Username or Email').fill(TEST_OWNER.username);
	await page.getByLabel('Password', { exact: true }).fill(TEST_OWNER.password);
	await page.getByRole('button', { name: 'Authenticate' }).click();
	await expect(page).toHaveURL(/\/settings$/);
});

test('form actions behind the guard refuse requests without a session', async ({ request }) => {
	const response = await request.post('/settings?/profile', {
		form: { name: 'Intruder', username: 'intruder' },
		headers: { Origin: 'http://localhost:4173' }
	});

	expect(response.status()).toBe(401);
});

test('signing out ends the session', async ({ page }) => {
	await signIn(page);
	await page.getByRole('button', { name: 'Account menu' }).click();
	const signOut = page.waitForResponse(
		(response) => response.request().method() === 'POST' && response.url().includes('/logout')
	);
	await page.getByRole('button', { name: 'Logout' }).click();
	expect((await (await signOut).allHeaders())['clear-site-data']).toBe('"cache", "storage"');

	await expect(page).toHaveURL(/\/login$/);
	await page.goto('/services');
	await expect(page).toHaveURL(/\/login\?redirectTo=/);
});
