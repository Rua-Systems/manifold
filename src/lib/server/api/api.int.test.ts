import { allScopeIds } from '$lib/modules/scopes';
import { note } from '$lib/modules/notes/schema.server';
import { service } from '$lib/modules/services/schema.server';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApiKey, listApiKeys, revokeApiKey } from '../api-keys';
import { getDb } from '../db';
import { purgeAuditEvents } from '../audit';
import { apiKey, auditEvent } from '../db/schema';
import { handleApiRequest } from './router';
import { apiRoutes, openApiDocument } from './routes';

const ORIGIN = 'http://localhost:4173';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

async function keyWith(scopes: string[], expiresAt: Date | null = null): Promise<string> {
	return (await createApiKey({ name: 'Test', scopes, expiresAt })).key;
}

async function call(
	method: string,
	path: string,
	key: string | null,
	body?: unknown
): Promise<Response> {
	const headers: Record<string, string> = {};
	if (key !== null) {
		headers.authorization = `Bearer ${key}`;
	}
	let payload: BodyInit | undefined;
	if (body instanceof FormData) {
		payload = body;
	} else if (body !== undefined) {
		headers['content-type'] = 'application/json';
		payload = JSON.stringify(body);
	}
	const request = new Request(`${ORIGIN}/api/v1${path}`, { method, headers, body: payload });
	return handleApiRequest(request, { origin: { ip: '10.9.9.9', userAgent: 'vitest' } });
}

async function json(response: Response): Promise<Record<string, unknown>> {
	return (await response.json()) as Record<string, unknown>;
}

let everything = '';

beforeEach(async () => {
	await getDb().delete(apiKey);
	await getDb().delete(note);
	await getDb().delete(service);
	await purgeAuditEvents(new Date(Date.now() + 60_000), 0);
	everything = await keyWith(allScopeIds());
});

describe('keys', () => {
	it('shows the key once and stores only its hash', async () => {
		const { key, view } = await createApiKey({
			name: 'Backup script',
			scopes: ['notes:read'],
			expiresAt: null
		});
		expect(key).toMatch(/^mfd_[a-z0-9]{8}_[A-Za-z0-9_-]{43}$/);
		expect(key.startsWith(`mfd_${view.prefix}_`)).toBe(true);

		const [row] = await getDb().select().from(apiKey).where(eq(apiKey.id, view.id));
		expect(row.keyHash).toMatch(/^[0-9a-f]{64}$/);
		expect(JSON.stringify(row)).not.toContain(key.slice(13));
		expect(JSON.stringify(await listApiKeys())).not.toContain(key.slice(13));
	});

	it('refuses missing, malformed, unknown, revoked and expired keys', async () => {
		const revoked = await createApiKey({
			name: 'Old',
			scopes: ['notes:read'],
			expiresAt: null
		});
		await revokeApiKey(revoked.view.id);
		const expired = await keyWith(['notes:read'], new Date(Date.now() - 1000));
		const unknown = `mfd_abcdefgh_${'A'.repeat(43)}`;

		expect((await call('GET', '/me', null)).status).toBe(401);
		for (const key of ['not-a-key', unknown, revoked.key, expired]) {
			const response = await call('GET', '/me', key);
			expect(response.status).toBe(401);
			expect(await json(response)).toEqual({
				error: {
					code: 'invalid_key',
					message: 'The API key is unknown, revoked or expired.'
				}
			});
		}
	});

	it('describes itself and records its last use', async () => {
		const response = await call('GET', '/me', everything);
		expect(response.status).toBe(200);
		expect(await json(response)).toMatchObject({ name: 'Test', expires_at: null });

		const [key] = await listApiKeys();
		expect(key.lastUsedAt).not.toBeNull();
		expect(key.lastUsedIp).toBe('10.9.9.9');
	});
});

describe('scopes', () => {
	it('every route refuses a key without its scope', async () => {
		const scoped = apiRoutes().filter((route) => route.scope !== null);
		expect(scoped.length).toBeGreaterThan(20);

		for (const route of scoped) {
			const key = await keyWith(allScopeIds().filter((scope) => scope !== route.scope));
			const path = route.path
				.replace('{id}', '00000000-0000-4000-8000-000000000000')
				.replace('{version}', '1');
			const response = await call(route.method, path, key);
			expect(response.status, `${route.method} ${route.path}`).toBe(403);
			expect((await json(response)).error).toMatchObject({ code: 'insufficient_scope' });
		}
	});

	it('answers 404 for unknown paths and 405 for unknown methods', async () => {
		expect((await call('GET', '/nothing-here', everything)).status).toBe(404);
		const response = await call('PUT', '/me', everything);
		expect(response.status).toBe(405);
		expect(response.headers.get('allow')).toBe('GET');
	});
});

describe('rate limit', () => {
	it('counts requests per key and says so in the headers', async () => {
		const first = await call('GET', '/me', everything);
		expect(first.headers.get('ratelimit-limit')).toBe('120');
		expect(first.headers.get('ratelimit-remaining')).toBe('119');

		let last = first;
		for (let index = 0; index < 120; index += 1) {
			last = await call('GET', '/me', everything);
		}
		expect(last.status).toBe(429);
		expect(last.headers.get('retry-after')).not.toBeNull();

		const other = await keyWith(['notes:read']);
		expect((await call('GET', '/me', other)).status).toBe(200);
	});
});

describe('notes', () => {
	it('takes Markdown in and gives JSON and Markdown out', async () => {
		const created = await call('POST', '/notes', everything, {
			title: 'Plan',
			markdown: '# Trip\n\n- ferry\n- hotel'
		});
		expect(created.status).toBe(201);
		const body = await json(created);
		expect(body).toMatchObject({ title: 'Plan', version: 1 });
		expect(body.markdown).toBe('# Trip\n\n- ferry\n- hotel');
		expect((body.content as { type: string }).type).toBe('doc');

		const markdownOnly = await json(
			await call('GET', `/notes/${String(body.id)}?format=markdown`, everything)
		);
		expect(markdownOnly.content).toBeUndefined();
		expect(markdownOnly.markdown).toBe('# Trip\n\n- ferry\n- hotel');
	});

	it('refuses content and markdown together, and a stale version with the current one', async () => {
		const both = await call('POST', '/notes', everything, {
			content: { type: 'doc', content: [] },
			markdown: 'x'
		});
		expect(both.status).toBe(400);

		const created = await json(await call('POST', '/notes', everything, { markdown: 'one' }));
		const path = `/notes/${String(created.id)}`;
		expect(
			(await call('PATCH', path, everything, { version: 1, markdown: 'two' })).status
		).toBe(200);
		const stale = await call('PATCH', path, everything, { version: 1, markdown: 'three' });
		expect(stale.status).toBe(409);
		expect(await json(stale)).toMatchObject({
			error: { code: 'version_conflict', current_version: 2 }
		});
	});

	it('refuses unknown node types with 422', async () => {
		const response = await call('POST', '/notes', everything, {
			content: { type: 'doc', content: [{ type: 'iframe' }] }
		});
		expect(response.status).toBe(422);
		expect((await json(response)).error).toMatchObject({ code: 'validation_failed' });
	});

	it('answers 400, not a server error, for a version beyond the column', async () => {
		const created = await json(
			await call('POST', '/notes', everything, { markdown: 'Bounds' })
		);
		const response = await call('GET', `/notes/${created.id}/revisions/3000000000`, everything);
		expect(response.status).toBe(400);
		expect((await json(response)).error).toMatchObject({ code: 'invalid_request' });
	});

	it('pages with a cursor, trashes, restores and keeps a revision per write', async () => {
		for (const title of ['a', 'b', 'c']) {
			await call('POST', '/notes', everything, { title });
		}
		const first = await json(await call('GET', '/notes?limit=2', everything));
		expect((first.data as unknown[]).length).toBe(2);
		expect(first.next_cursor).toEqual(expect.any(String));
		const second = await json(
			await call('GET', `/notes?limit=2&cursor=${String(first.next_cursor)}`, everything)
		);
		expect((second.data as unknown[]).length).toBe(1);
		expect(second.next_cursor).toBeNull();

		const { id, title } = (first.data as { id: string; title: string }[])[0];
		await call('PATCH', `/notes/${id}`, everything, { version: 1, title: 'changed' });
		await call('PATCH', `/notes/${id}`, everything, { version: 2, title: 'changed again' });
		const revisions = await json(await call('GET', `/notes/${id}/revisions`, everything));
		expect(
			(revisions.data as { version: number; actor_type: string }[]).map(
				(item) => item.version
			)
		).toEqual([3, 2, 1]);
		expect((revisions.data as { actor_type: string }[])[0].actor_type).toBe('api_key');

		expect((await call('DELETE', `/notes/${id}`, everything)).status).toBe(204);
		const listed = await json(await call('GET', '/notes', everything));
		expect((listed.data as { id: string }[]).some((item) => item.id === id)).toBe(false);
		const withTrash = await json(await call('GET', '/notes?include_trashed=true', everything));
		expect((withTrash.data as { id: string }[]).some((item) => item.id === id)).toBe(true);
		expect((await call('POST', `/notes/${id}/restore`, everything)).status).toBe(200);

		const restored = await json(
			await call('POST', `/notes/${id}/revisions/1/restore`, everything)
		);
		expect(restored).toMatchObject({ title, version: 4 });
	});

	it('records API writes in the audit log with the key as actor', async () => {
		const created = await json(await call('POST', '/notes', everything, { title: 'Logged' }));
		const [event] = await getDb()
			.select()
			.from(auditEvent)
			.where(eq(auditEvent.action, 'note.create'));
		expect(event).toMatchObject({
			actorType: 'api_key',
			targetType: 'note',
			targetId: created.id,
			ip: '10.9.9.9'
		});
	});
});

describe('map', () => {
	const square = {
		type: 'Polygon',
		coordinates: [
			[
				[10, 10],
				[11, 10],
				[11, 11],
				[10, 11],
				[10, 10]
			]
		]
	};

	it('creates a feature with a new note and filters by bounding box', async () => {
		const response = await call('POST', '/map/features', everything, {
			type: 'Feature',
			geometry: square,
			note: { title: 'Field', markdown: 'Corn' }
		});
		expect(response.status).toBe(201);
		const feature = await json(response);
		expect(feature).toMatchObject({
			type: 'Feature',
			properties: { note_title: 'Field', kind: 'polygon' }
		});

		const inside = await json(await call('GET', '/map/features?bbox=9,9,12,12', everything));
		expect(inside.type).toBe('FeatureCollection');
		expect((inside.features as unknown[]).length).toBe(1);
		const outside = await json(await call('GET', '/map/features?bbox=50,50,51,51', everything));
		expect((outside.features as unknown[]).length).toBe(0);
		expect((await call('GET', '/map/features?bbox=1,2,3', everything)).status).toBe(400);
	});

	it('refuses invalid geometries and needs exactly one of note_id and note', async () => {
		const bowtie = {
			type: 'Polygon',
			coordinates: [
				[
					[0, 0],
					[1, 1],
					[1, 0],
					[0, 1],
					[0, 0]
				]
			]
		};
		const invalid = await call('POST', '/map/features', everything, {
			type: 'Feature',
			geometry: bowtie,
			note: {}
		});
		expect(invalid.status).toBe(422);

		const neither = await call('POST', '/map/features', everything, {
			type: 'Feature',
			geometry: square
		});
		expect(neither.status).toBe(400);

		const multi = await call('POST', '/map/features', everything, {
			type: 'Feature',
			geometry: { type: 'MultiPoint', coordinates: [[0, 0]] },
			note: {}
		});
		expect(multi.status).toBe(400);
	});
});

describe('services and files', () => {
	it('creates, reorders and deletes services', async () => {
		const a = await json(
			await call('POST', '/services', everything, {
				alias: 'A',
				url: 'https://a.example.com'
			})
		);
		const b = await json(
			await call('POST', '/services', everything, {
				alias: 'B',
				url: 'https://b.example.com'
			})
		);
		const reordered = await json(
			await call('PUT', '/services/order', everything, { ids: [b.id, a.id] })
		);
		expect((reordered.data as { alias: string }[]).map((item) => item.alias)).toEqual([
			'B',
			'A'
		]);

		const bad = await call('POST', '/services', everything, {
			alias: 'C',
			url: 'javascript:x'
		});
		expect(bad.status).toBe(422);
		expect((await call('DELETE', `/services/${String(a.id)}`, everything)).status).toBe(204);
		expect((await call('GET', `/services/${String(a.id)}`, everything)).status).toBe(404);
	});

	it('uploads an image and serves it back', async () => {
		const form = new FormData();
		form.set('file', new File([new Uint8Array(PNG)], 'dot.png'));
		const uploaded = await call('POST', '/files', everything, form);
		expect(uploaded.status).toBe(201);
		const file = await json(uploaded);
		expect(file).toMatchObject({ mime_type: 'image/png', url: `/files/${String(file.id)}` });

		const fetched = await call('GET', `/files/${String(file.id)}`, everything);
		expect(fetched.status).toBe(200);
		expect(fetched.headers.get('content-type')).toBe('image/png');

		const text = new FormData();
		text.set('file', new File([new TextEncoder().encode('hello')], 'note.txt'));
		expect((await call('POST', '/files', everything, text)).status).toBe(422);
	});
});

describe('OpenAPI', () => {
	it('documents every registered route with its scope', async () => {
		const document = openApiDocument() as {
			openapi: string;
			paths: Record<string, Record<string, { 'x-scope': string | null }>>;
		};
		expect(document.openapi).toBe('3.1.0');
		for (const route of apiRoutes()) {
			const operation = document.paths[route.path]?.[route.method.toLowerCase()];
			expect(operation, `${route.method} ${route.path}`).toBeDefined();
			expect(operation['x-scope']).toBe(route.scope);
		}
	});

	it('is served to any valid key', async () => {
		expect((await call('GET', '/openapi.json', null)).status).toBe(401);
		const key = await keyWith(['files:read']);
		const response = await call('GET', '/openapi.json', key);
		expect(response.status).toBe(200);
		expect(await json(response)).toMatchObject({ openapi: '3.1.0' });
	});
});
