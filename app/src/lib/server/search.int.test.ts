import { createNote, trashNote } from '$lib/modules/notes/notes.server';
import { note } from '$lib/modules/notes/schema.server';
import { service } from '$lib/modules/services/schema.server';
import { createService } from '$lib/modules/services/services.server';
import { vaultSecret } from '$lib/modules/vault/schema.server';
import { createSecret } from '$lib/modules/vault/vault.server';
import { beforeEach, describe, expect, it } from 'vitest';
import { ownerActor } from './actor';
import { createApiKey } from './api-keys';
import { handleApiRequest } from './api/router';
import { getDb } from './db';
import { search } from './search';

const OWNER = ownerActor('owner-1');

function doc(text: string) {
	return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

beforeEach(async () => {
	await getDb().delete(note);
	await getDb().delete(service);
	await getDb().delete(vaultSecret);

	await createNote({ title: 'Istanbul trip', content: doc('Book the ferry to Kadıköy') }, OWNER);
	await createNote({ title: 'Groceries', content: doc('Milk and bread for the trip') }, OWNER);
	const trashed = await createNote({ title: 'Old trip', content: doc('Gone') }, OWNER);
	await trashNote(trashed.id);
	await createService({ alias: 'Grafana', url: 'https://grafana.example.com' });
	await createService({ alias: 'Mail', url: 'https://webmail.example.com' });
	await createSecret({
		name: 'Grafana admin',
		serviceUrl: 'https://grafana.example.com',
		description: '',
		value: 'top-secret-value'
	});
});

describe('search', () => {
	it('finds notes by the start of words in the title and the text, titles first', async () => {
		const hits = await search('trip', { types: ['note'] });
		expect(hits.map((hit) => hit.title)).toEqual(['Istanbul trip', 'Groceries']);
		expect(hits[1].snippet).toContain('trip');
		expect(hits[0]).toMatchObject({ type: 'note', external: false });
		expect(hits[0].href).toBe(`/notes/${hits[0].id}`);

		expect((await search('ferr', { types: ['note'] })).map((hit) => hit.title)).toEqual([
			'Istanbul trip'
		]);
		expect((await search('kadıköy', { types: ['note'] })).map((hit) => hit.title)).toEqual([
			'Istanbul trip'
		]);
	});

	it('forgives typos in titles and aliases', async () => {
		expect((await search('Istanbol', { types: ['note'] })).map((hit) => hit.title)).toContain(
			'Istanbul trip'
		);
		expect((await search('grafna', { types: ['service'] })).map((hit) => hit.title)).toEqual([
			'Grafana'
		]);
	});

	it('finds services by address and opens them outside', async () => {
		const [hit] = await search('webmail', { types: ['service'] });
		expect(hit).toMatchObject({
			type: 'service',
			title: 'Mail',
			href: 'https://webmail.example.com',
			external: true
		});
	});

	it('merges every module into one list and never shows vault values', async () => {
		const hits = await search('grafana');
		expect(new Set(hits.map((hit) => hit.type))).toEqual(new Set(['service', 'secret']));
		expect(JSON.stringify(hits)).not.toContain('top-secret-value');
		expect(await search('   ')).toEqual([]);
	});

	it('leaves out modules whose scope is missing', async () => {
		expect(await search('grafana', { scopes: ['notes:read'] })).toEqual([]);
		const services = await search('grafana', { scopes: ['services:read'] });
		expect(services.map((hit) => hit.type)).toEqual(['service']);
	});
});

describe('API search', () => {
	async function apiSearch(scopes: string[], query: string) {
		const { key } = await createApiKey({ name: 'Search', scopes, expiresAt: null });
		const response = await handleApiRequest(
			new Request(`http://localhost/api/v1/search?q=${encodeURIComponent(query)}`, {
				headers: { authorization: `Bearer ${key}` }
			}),
			{ origin: { ip: null, userAgent: null } }
		);
		expect(response.status).toBe(200);
		return ((await response.json()) as { data: { type: string; link: string }[] }).data;
	}

	it('answers only what the key may read', async () => {
		expect((await apiSearch(['notes:read'], 'grafana')).map((hit) => hit.type)).toEqual([]);
		expect((await apiSearch(['notes:read'], 'trip')).map((hit) => hit.type)).toEqual([
			'note',
			'note'
		]);
		const all = await apiSearch(['services:read', 'vault:read'], 'grafana');
		expect(all.map((hit) => hit.type).sort()).toEqual(['secret', 'service']);
		expect(all.find((hit) => hit.type === 'service')?.link).toBe('https://grafana.example.com');
	});
});
