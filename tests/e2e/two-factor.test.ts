import type { Page } from '@playwright/test';
import { randomInt } from 'node:crypto';
import { TEST_OWNER } from '../support/owner.ts';
import { totp } from '../support/totp.ts';
import { withDatabase } from './database';
import { expect, signIn, test } from './fixtures';

// These tests turn two factor authentication on for the one shared owner, so each one turns it
// off again afterwards, whatever happened.

test.afterEach(async () => {
	await withDatabase(async (sql) => {
		await sql`update "user" set two_factor_enabled = false`;
		await sql`delete from two_factor`;
	});
});

/** Turns two factor authentication on through Settings and answers the secret and backup codes. */
async function enableTwoFactor(
	page: Page
): Promise<{ secret: string; code: () => Promise<string>; backupCodes: string[] }> {
	await page.goto('/settings/security', { waitUntil: 'networkidle' });
	await expect(page.locator('.status')).toHaveText('Off');
	await page.getByLabel('Password', { exact: true }).fill(TEST_OWNER.password);
	await page.getByRole('button', { name: 'Set Up' }).click();

	await expect(
		page.getByRole('img', { name: 'QR code for your authenticator app' })
	).toBeVisible();
	const secret = ((await page.locator('.secret code').textContent()) ?? '').replace(/\s/g, '');
	const code = authenticator(secret);
	await page.getByLabel('Authenticator code').fill(await code());
	await page.getByRole('button', { name: 'Turn On' }).click();

	await expect(page.getByText('Two factor authentication is on.')).toBeVisible();
	await expect(page.locator('.status')).toHaveText('On');
	const codes = page.getByRole('list', { name: 'Backup codes' }).getByRole('listitem');
	await expect(codes).toHaveCount(10);
	const backupCodes = (await codes.allTextContents()).map((code) => code.trim());
	return { secret, code, backupCodes };
}

const STEP_MS = 30_000;
const PREVIOUS_STEP_MARGIN_MS = 10_000;

/**
 * The owner's authenticator: each call answers a code the server accepts that was not used yet,
 * since an accepted code is refused a second time. Better Auth accepts the codes of the steps
 * before and after the current one. The code of the step before expires when the current step
 * ends, which can come between filling it in and the server checking it, so it is only answered
 * while enough of the step is left. Otherwise the call waits for the next step, which keeps the
 * wait shorter than a test's timeout.
 */
function authenticator(secret: string): () => Promise<string> {
	const used = new Set<string>();
	return async () => {
		for (;;) {
			const left = STEP_MS - (Date.now() % STEP_MS);
			const offsets = [0, STEP_MS];
			if (left > PREVIOUS_STEP_MARGIN_MS) {
				offsets.push(-STEP_MS);
			}
			for (const offset of offsets) {
				const code = totp(secret, Date.now() + offset);
				if (!used.has(code)) {
					used.add(code);
					return code;
				}
			}
			await new Promise((resolve) => setTimeout(resolve, left));
		}
	};
}

/** The kind of code is a radio group drawn as a segmented control; the label takes the click. */
async function chooseSecondFactor(page: Page, name: string): Promise<void> {
	await page.getByRole('radio', { name }).check({ force: true });
}

/**
 * Signs out by dropping the cookies, then enters the password: the second step should follow.
 * Each sign in comes from a new address, so the sign in rate limit counts it as a new visitor.
 */
async function signInToSecondStep(page: Page): Promise<void> {
	await page.context().clearCookies();
	await page.context().setExtraHTTPHeaders({
		'X-Forwarded-For': `10.250.${randomInt(0, 256)}.${randomInt(1, 255)}`
	});
	await page.goto('/login', { waitUntil: 'networkidle' });
	await page.getByLabel('Username or Email').fill(TEST_OWNER.username);
	await page.getByLabel('Password', { exact: true }).fill(TEST_OWNER.password);
	await page.getByRole('button', { name: 'Authenticate' }).click();
	await expect(
		page.getByText('Enter the code from your authenticator app, or one of your backup codes.')
	).toBeVisible();
}

test('two factor sign in works with a TOTP code and with single use backup codes', async ({
	page
}) => {
	await signIn(page);
	const { code, backupCodes } = await enableTwoFactor(page);

	await signInToSecondStep(page);
	const first = await code();
	await page.getByLabel('Authenticator code').fill(first);
	await page.getByRole('button', { name: 'Verify' }).click();
	await page.waitForURL(/\/dashboard$/);

	await signInToSecondStep(page);
	await page.getByLabel('Authenticator code').fill(first);
	await page.getByRole('button', { name: 'Verify' }).click();
	await expect(page.locator('#loginSecondFactorError')).toHaveText('That code is not valid.');

	await chooseSecondFactor(page, 'Backup code');
	await page.getByRole('textbox', { name: 'Backup code' }).fill(backupCodes[0]);
	await page.getByRole('button', { name: 'Verify' }).click();
	await page.waitForURL(/\/dashboard$/);

	await signInToSecondStep(page);
	await chooseSecondFactor(page, 'Backup code');
	await page.getByRole('textbox', { name: 'Backup code' }).fill(backupCodes[0]);
	await page.getByRole('button', { name: 'Verify' }).click();
	await expect(page.locator('#loginSecondFactorError')).toHaveText('That code is not valid.');

	await chooseSecondFactor(page, 'Authenticator');
	await page.getByLabel('Authenticator code').fill(await code());
	await page.getByRole('button', { name: 'Verify' }).click();
	await page.waitForURL(/\/dashboard$/);
});

test('a wrong code is refused and two factor can be turned off again', async ({ page }) => {
	await signIn(page);
	const { secret, code } = await enableTwoFactor(page);

	await signInToSecondStep(page);
	await page
		.getByLabel('Authenticator code')
		.fill(totp(secret) === '000000' ? '111111' : '000000');
	await page.getByRole('button', { name: 'Verify' }).click();
	await expect(page.locator('#loginSecondFactorError')).toHaveText('That code is not valid.');
	await page.getByLabel('Authenticator code').fill(await code());
	await page.getByRole('button', { name: 'Verify' }).click();
	await page.waitForURL(/\/dashboard$/);

	await page.goto('/settings/security', { waitUntil: 'networkidle' });
	const disable = page.locator('form[action="?/disableTwoFactor"]');
	await disable.getByLabel('Password', { exact: true }).fill(TEST_OWNER.password);
	await disable.getByLabel('Authenticator code').fill(await code());
	await disable.getByRole('button', { name: 'Turn Off Two Factor Authentication' }).click();
	await expect(page.getByText('Two factor authentication is off.')).toBeVisible();
	await expect(page.locator('.status')).toHaveText('Off');

	await page.context().clearCookies();
	await signIn(page);
});

test('new backup codes replace the old ones', async ({ page }) => {
	await signIn(page);
	const { code, backupCodes } = await enableTwoFactor(page);

	await page.reload();
	const regenerate = page.locator('form[action="?/regenerateBackupCodes"]');
	await regenerate.getByLabel('Password', { exact: true }).fill(TEST_OWNER.password);
	await regenerate.getByLabel('Authenticator code').fill(await code());
	await regenerate.getByRole('button', { name: 'Create New Codes' }).click();
	await expect(
		page.getByText('New backup codes created. The old ones no longer work.')
	).toBeVisible();
	const fresh = await page
		.getByRole('list', { name: 'Backup codes' })
		.getByRole('listitem')
		.allTextContents();
	expect(fresh).toHaveLength(10);
	expect(fresh).not.toContain(backupCodes[0]);

	await signInToSecondStep(page);
	await chooseSecondFactor(page, 'Backup code');
	await page.getByRole('textbox', { name: 'Backup code' }).fill(backupCodes[1]);
	await page.getByRole('button', { name: 'Verify' }).click();
	await expect(page.locator('#loginSecondFactorError')).toHaveText('That code is not valid.');
	await page.getByRole('textbox', { name: 'Backup code' }).fill(fresh[0].trim());
	await page.getByRole('button', { name: 'Verify' }).click();
	await page.waitForURL(/\/dashboard$/);
});
