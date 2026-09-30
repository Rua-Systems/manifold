import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { getDb } from './db';
import { knownUserAgent } from './db/schema';
import { noticeLocale, rememberUserAgent } from './notices';
import { findOwner } from './owner';
import { saveUserSettings } from './user-settings';

async function ownerId(): Promise<string> {
	const owner = await findOwner(getDb());
	if (owner === null) {
		throw new Error('The test database has no owner.');
	}
	return owner.id;
}

describe('rememberUserAgent', () => {
	it('reports a browser as new only the first time', async () => {
		const userId = await ownerId();
		const agent = `Test Browser ${randomUUID()}`;

		expect(await rememberUserAgent(userId, agent)).toBe(true);
		expect(await rememberUserAgent(userId, agent)).toBe(false);
		expect(await rememberUserAgent(userId, `${agent} other`)).toBe(true);
	});

	it('stores only a hash of the user agent', async () => {
		const userId = await ownerId();
		const agent = `Hashed Browser ${randomUUID()}`;
		await rememberUserAgent(userId, agent);

		const rows = await getDb()
			.select({ hash: knownUserAgent.userAgentHash })
			.from(knownUserAgent);
		expect(rows.every((row) => /^[0-9a-f]{64}$/.test(row.hash))).toBe(true);
		expect(rows.some((row) => row.hash.includes('Hashed'))).toBe(false);
	});

	it('treats a missing user agent as one browser', async () => {
		const userId = await ownerId();

		await rememberUserAgent(userId, null);
		expect(await rememberUserAgent(userId, null)).toBe(false);
	});
});

describe('noticeLocale', () => {
	afterEach(async () => {
		await saveUserSettings(await ownerId(), { locale: null, theme: null });
	});

	it('follows the request without a chosen mail language', async () => {
		expect(await noticeLocale('en')).toBe('en');
		expect(await noticeLocale('tr')).toBe('tr');
	});

	it('uses the chosen mail language whatever the request', async () => {
		await saveUserSettings(await ownerId(), { locale: 'tr', theme: null });
		expect(await noticeLocale('en')).toBe('tr');

		await saveUserSettings(await ownerId(), { locale: 'en', theme: null });
		expect(await noticeLocale('tr')).toBe('en');
	});
});
