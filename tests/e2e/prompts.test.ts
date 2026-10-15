import { withDatabase } from './database';
import { expect, signIn, test } from './fixtures';

const PROMPT_URL = /\/memory\/prompts\/[0-9a-f-]{36}$/;

test.beforeEach(async ({ page }) => {
	await withDatabase(async (sql) => {
		await sql`delete from memory_prompt`;
		await sql`delete from tag`;
		await sql`insert into tag (name, color) values ('writing', 'violet')`;
	});
	await signIn(page);
});

test('a prompt is saved with its places, tried out, changed and deleted', async ({ page }) => {
	await page.goto('/memory/prompts', { waitUntil: 'networkidle' });
	await expect(page.getByText('No prompts yet.')).toBeVisible();
	await page.getByRole('link', { name: 'New Prompt' }).click();
	await expect(page).toHaveURL(/\/memory\/prompts\/new$/);

	await page.getByLabel('Title', { exact: true }).fill('Weekly Summary');
	await expect(page.getByLabel('Handle')).toHaveValue('weekly-summary');
	await page.getByRole('checkbox', { name: 'writing' }).check();
	await page.getByLabel('Text', { exact: true }).fill('Summarize {{notes}} for {{ audience }}.');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page).toHaveURL(PROMPT_URL);
	await expect(page.getByText('Prompt saved.')).toBeVisible();

	const trial = page.getByRole('region', { name: 'Try it' });
	await trial.getByLabel('notes').fill('the standup notes');
	await expect(trial.getByLabel('Filled text')).toHaveText(
		'Summarize the standup notes for {{ audience }}.'
	);

	await page.getByLabel('Handle').fill('Not A Handle');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.locator('#promptNameError')).toHaveText(
		'Use lower case letters and digits, with single hyphens between words.'
	);
	await page.getByLabel('Handle').fill('summary');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page.locator('#promptNameError')).toHaveText('');
	await page.reload({ waitUntil: 'networkidle' });
	await expect(page.getByLabel('Handle')).toHaveValue('summary');

	await page.goto('/memory/prompts', { waitUntil: 'networkidle' });
	const list = page.getByRole('list', { name: 'Prompts' });
	await expect(list).toContainText('/summary');
	await expect(list).toContainText('notes, audience');
	await expect(list).toContainText('writing');

	await list.getByRole('link', { name: /Weekly Summary/ }).click();
	await page.getByRole('button', { name: 'Delete' }).click();
	await page
		.getByRole('dialog', { name: 'Delete Prompt' })
		.getByRole('button', { name: 'Delete' })
		.click();
	await expect(page).toHaveURL(/\/memory\/prompts$/);
	await expect(page.getByText('Prompt deleted.')).toBeVisible();
	await expect(page.getByText('No prompts yet.')).toBeVisible();
});
