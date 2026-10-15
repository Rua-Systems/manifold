import { createApiKey } from '$lib/server/api-keys';
import { handleApiRequest } from '$lib/server/api/router';
import { purgeAuditEvents } from '$lib/server/audit';
import { getDb } from '$lib/server/db';
import { apiKey, auditEvent, tag } from '$lib/server/db/schema';
import { handleMcpRequest } from '$lib/server/mcp/server';
import { search } from '$lib/server/search';
import { createTag } from '$lib/server/tags/tags';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { desc, eq, isNotNull } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { limitKeyToCategories } from './access.server';
import { createMemoryCategory } from './categories.server';
import { memory, memoryCategory, memoryKeyCategory } from './schema.server';

const ORIGIN = 'http://localhost:4173';

async function keyWith(scopes: string[], categories: string[] = []) {
	const created = await createApiKey({ name: 'Memory agent', scopes, expiresAt: null });
	if (categories.length > 0) {
		await getDb().transaction((tx) => limitKeyToCategories(tx, created.view.id, categories));
	}
	return created;
}

async function call(method: string, path: string, key: string, body?: unknown) {
	const headers: Record<string, string> = { authorization: `Bearer ${key}` };
	let payload: string | undefined;
	if (body !== undefined) {
		headers['content-type'] = 'application/json';
		payload = JSON.stringify(body);
	}
	const response = await handleApiRequest(
		new Request(`${ORIGIN}/api/v1${path}`, { method, headers, body: payload }),
		{ origin: { ip: '10.8.8.8', userAgent: 'vitest' } }
	);
	let json: Record<string, unknown> = {};
	if (response.status !== 204) {
		json = (await response.json()) as Record<string, unknown>;
	}
	return { status: response.status, json };
}

const clients: Client[] = [];

async function mcpWith(key: string): Promise<Client> {
	const transport = new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
		requestInit: { headers: { authorization: `Bearer ${key}` } },
		fetch: (url, init) =>
			handleMcpRequest(new Request(url, init), {
				origin: { ip: '10.8.8.9', userAgent: 'mcp-test' }
			})
	});
	const client = new Client({ name: 'test', version: '1.0.0' });
	await client.connect(transport);
	clients.push(client);
	return client;
}

async function tool(client: Client, name: string, args: Record<string, unknown>) {
	const answer = (await client.callTool({ name, arguments: args })) as {
		isError?: boolean;
		content: { text: string }[];
	};
	return {
		isError: answer.isError === true,
		data: JSON.parse(answer.content[0].text) as Record<string, unknown>
	};
}

beforeEach(async () => {
	await getDb().delete(memory);
	await getDb().delete(memoryKeyCategory);
	await getDb().delete(apiKey);
	await getDb().delete(memoryCategory).where(isNotNull(memoryCategory.parentId));
	await getDb().delete(memoryCategory);
	await getDb().delete(tag);
	await purgeAuditEvents(new Date(Date.now() + 60_000), 0);
});

afterEach(async () => {
	while (clients.length > 0) {
		await clients.pop()?.close();
	}
});

describe('the memory API', () => {
	it('writes, reads, changes and trashes memories in Markdown, with tags by name', async () => {
		const work = await createMemoryCategory({ name: 'Work', parentId: null });
		await createTag({ name: 'Style', color: 'blue' });
		const { key } = await keyWith(['memory:read', 'memory:write']);

		const created = await call('POST', '/memories', key, {
			title: 'Commit messages',
			markdown: '# Rule\n\nUse the **imperative** mood.',
			category_id: work.id,
			tags: ['style'],
			pinned: true
		});
		expect(created.status).toBe(201);
		expect(created.json).toMatchObject({
			title: 'Commit messages',
			version: 1,
			category_id: work.id,
			category: 'Work',
			tags: ['Style'],
			pinned: true
		});
		expect(created.json.markdown).toContain('**imperative**');
		const id = String(created.json.id);

		const unknown = await call('POST', '/memories', key, { title: 'x', tags: ['Nope'] });
		expect(unknown.status).toBe(422);
		expect(unknown.json).toMatchObject({
			error: { fields: { tags: expect.stringContaining('Nope') } }
		});
		const image = await call('POST', '/memories', key, {
			title: 'x',
			markdown: '![a](/files/00000000-0000-4000-8000-000000000000)'
		});
		expect(image.json).toMatchObject({ error: { fields: { markdown: expect.any(String) } } });

		const unpinned = await call('PATCH', `/memories/${id}`, key, { pinned: false });
		expect(unpinned.json).toMatchObject({ version: 1, pinned: false });
		const noVersion = await call('PATCH', `/memories/${id}`, key, { title: 'New' });
		expect(noVersion.status).toBe(400);
		const changed = await call('PATCH', `/memories/${id}`, key, {
			version: 1,
			markdown: 'Imperative mood, short subject.'
		});
		expect(changed.json).toMatchObject({ version: 2 });
		const stale = await call('PATCH', `/memories/${id}`, key, { version: 1, title: 'Old' });
		expect(stale.status).toBe(409);
		expect(stale.json).toMatchObject({ error: { current_version: 2 } });

		const listed = await call('GET', '/memories?tags=style&category_id=' + work.id, key);
		expect((listed.json.data as { id: string }[]).map((item) => item.id)).toEqual([id]);
		const none = await call('GET', '/memories?category_id=none', key);
		expect(none.json.data).toEqual([]);

		const revisions = await call('GET', `/memories/${id}/revisions`, key);
		expect(revisions.json.data).toEqual([
			expect.objectContaining({
				version: 2,
				actor_type: 'api_key',
				actor_name: 'Memory agent'
			}),
			expect.objectContaining({ version: 1, actor_type: 'api_key' })
		]);
		const first = await call('GET', `/memories/${id}/revisions/1`, key);
		expect(first.json.markdown).toContain('imperative');

		expect((await call('DELETE', `/memories/${id}`, key)).status).toBe(204);
		expect((await call('GET', `/memories/${id}`, key)).json).toMatchObject({
			deleted_at: expect.any(String)
		});
		const restored = await call('POST', `/memories/${id}/restore`, key);
		expect(restored.json).toMatchObject({ deleted_at: null });

		const [event] = await getDb()
			.select()
			.from(auditEvent)
			.where(eq(auditEvent.action, 'memory.restore'))
			.orderBy(desc(auditEvent.occurredAt))
			.limit(1);
		expect(event).toMatchObject({ actorType: 'api_key', targetId: id });
	});

	it('refuses a key without the memory scopes', async () => {
		const { key } = await keyWith(['notes:read']);
		expect((await call('GET', '/memories', key)).status).toBe(403);
		expect((await call('GET', '/memory/context', key)).status).toBe(403);
		const { key: reader } = await keyWith(['memory:read']);
		expect((await call('POST', '/memories', reader, { title: 'x' })).status).toBe(403);
	});

	it('keeps a limited key inside its categories, in lists, the context and the search', async () => {
		const work = await createMemoryCategory({ name: 'Work', parentId: null });
		const atlas = await createMemoryCategory({ name: 'Atlas', parentId: work.id });
		const home = await createMemoryCategory({ name: 'Home', parentId: null });
		const { key: owner } = await keyWith(['memory:read', 'memory:write']);
		const inHome = await call('POST', '/memories', owner, {
			title: 'Home router password hint',
			category_id: home.id,
			pinned: true
		});
		await call('POST', '/memories', owner, {
			title: 'Atlas deploy steps',
			category_id: atlas.id,
			pinned: true
		});

		const limited = await keyWith(['memory:read', 'memory:write'], [work.id]);
		const context = await call('GET', '/memory/context', limited.key);
		expect(context.json).toMatchObject({ limited: true });
		expect((context.json.pinned as { title: string }[]).map((item) => item.title)).toEqual([
			'Atlas deploy steps'
		]);
		expect(
			(context.json.categories as { path: string }[]).map((item) => item.path).sort()
		).toEqual(['Work', 'Work / Atlas']);

		const categories = await call('GET', '/memory-categories', limited.key);
		expect((categories.json.data as unknown[]).length).toBe(2);
		expect((await call('GET', `/memories/${inHome.json.id}`, limited.key)).status).toBe(404);
		const outside = await call('POST', '/memories', limited.key, {
			title: 'x',
			category_id: home.id
		});
		expect(outside.json).toMatchObject({
			error: { fields: { category_id: expect.any(String) } }
		});

		const hits = await search('router deploy', {
			scopes: ['memory:read'],
			key: { ...limited.view, expiresAt: null }
		});
		expect(hits.every((hit) => hit.title !== 'Home router password hint')).toBe(true);
		const ownerHits = await search('router', { types: ['memory'] });
		expect(ownerHits.map((hit) => hit.title)).toEqual(['Home router password hint']);
	});
});

describe('the memory MCP tools', () => {
	it('reads the context, remembers, searches and updates with versions', async () => {
		const work = await createMemoryCategory({ name: 'Work', parentId: null });
		await createTag({ name: 'decision', color: 'amber' });
		const { key } = await keyWith(['memory:read', 'memory:write']);
		const client = await mcpWith(key);

		const names = (await client.listTools()).tools.map((item) => item.name);
		expect(names).toEqual(
			expect.arrayContaining([
				'get_memory_context',
				'search_memories',
				'get_memory',
				'remember',
				'update_memory',
				'trash_memory',
				'restore_memory',
				'list_memory_categories',
				'list_memory_revisions'
			])
		);

		const remembered = await tool(client, 'remember', {
			title: 'Use PostGIS 17',
			markdown: 'The project runs **PostGIS 17**.',
			category_id: work.id,
			tags: ['Decision'],
			pinned: true
		});
		expect(remembered.isError).toBe(false);
		const id = String(remembered.data.id);

		const context = await tool(client, 'get_memory_context', {});
		expect(context.data).toMatchObject({
			pinned: [expect.objectContaining({ id, tags: ['decision'] })],
			tags: [expect.objectContaining({ name: 'decision' })],
			limited: false
		});

		const found = await tool(client, 'search_memories', {
			query: 'postgis',
			tags: ['decision']
		});
		expect((found.data.data as { id: string }[]).map((item) => item.id)).toEqual([id]);

		const conflict = await tool(client, 'update_memory', {
			id,
			version: 5,
			markdown: 'PostGIS 18'
		});
		expect(conflict.isError).toBe(true);
		expect(conflict.data).toMatchObject({ error: { code: 'version_conflict' } });
		const updated = await tool(client, 'update_memory', {
			id,
			version: 1,
			markdown: 'The project runs PostGIS 17 on PostgreSQL 17.'
		});
		expect(updated.data).toMatchObject({ version: 2 });

		const trashed = await tool(client, 'trash_memory', { id });
		expect(trashed.data).toEqual({ trashed: true });
		const inTrash = await tool(client, 'search_memories', { trashed: true });
		expect((inTrash.data.data as { id: string }[]).map((item) => item.id)).toEqual([id]);
		expect((await tool(client, 'restore_memory', { id })).isError).toBe(false);

		const [event] = await getDb()
			.select()
			.from(auditEvent)
			.where(eq(auditEvent.action, 'memory.create'))
			.limit(1);
		expect(event).toMatchObject({ targetId: id, metadata: { via: 'mcp' } });
	});

	it('offers only the reading tools to a key that may only read', async () => {
		const { key } = await keyWith(['memory:read']);
		const names = (await (await mcpWith(key)).listTools()).tools.map((item) => item.name);
		expect(names).toContain('search_memories');
		expect(names).not.toContain('remember');
		expect(names).not.toContain('update_memory');
	});
});
