import { createApiKey } from '$lib/server/api-keys';
import { handleApiRequest } from '$lib/server/api/router';
import { purgeAuditEvents } from '$lib/server/audit';
import { getDb } from '$lib/server/db';
import { apiKey, auditEvent } from '$lib/server/db/schema';
import { handleMcpRequest } from '$lib/server/mcp/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { desc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from '../../../../tests/support/test-database';
import { dataSource } from './schema.server';

const ORIGIN = 'http://localhost:4173';
const database = new URL(testDatabaseUrl());

async function keyWith(scopes: string[]): Promise<string> {
	return (await createApiKey({ name: 'Data sources', scopes, expiresAt: null })).key;
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
		{ origin: { ip: '10.6.6.6', userAgent: 'vitest' } }
	);
	let json: Record<string, unknown> = {};
	if (response.status !== 204) {
		json = (await response.json()) as Record<string, unknown>;
	}
	return { status: response.status, json };
}

async function lastAudit(action: string) {
	const [event] = await getDb()
		.select()
		.from(auditEvent)
		.where(eq(auditEvent.action, action))
		.orderBy(desc(auditEvent.occurredAt))
		.limit(1);
	return event;
}

const clients: Client[] = [];

async function mcpWith(scopes: string[]): Promise<Client> {
	const key = await keyWith(scopes);
	const transport = new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
		requestInit: { headers: { authorization: `Bearer ${key}` } },
		fetch: (url, init) =>
			handleMcpRequest(new Request(url, init), {
				origin: { ip: '10.6.6.7', userAgent: 'mcp-test' }
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

let writer = '';

beforeEach(async () => {
	await getDb().delete(dataSource);
	await getDb().delete(apiKey);
	await purgeAuditEvents(new Date(Date.now() + 60_000), 0);
	writer = await keyWith(['datasources:read', 'datasources:write']);
});

afterEach(async () => {
	while (clients.length > 0) {
		await clients.pop()?.close();
	}
});

/** The test database as a source, through the API. */
async function addDatabase(key = writer) {
	return call('POST', '/data-sources', key, {
		name: 'Test database',
		type: 'postgresql',
		description: 'The integration tests run here.',
		docs_url: 'https://www.postgresql.org/docs/',
		settings: {
			host: database.hostname,
			port: Number(database.port),
			database: database.pathname.slice(1),
			username: decodeURIComponent(database.username),
			ssh: { enabled: false }
		},
		secrets: { password: decodeURIComponent(database.password) }
	});
}

describe('the data sources API', () => {
	it('adds, lists, reads, changes and deletes sources in snake_case, without secrets', async () => {
		const created = await addDatabase();
		expect(created.status).toBe(201);
		expect(created.json).toMatchObject({
			name: 'Test database',
			type: 'postgresql',
			docs_url: 'https://www.postgresql.org/docs/',
			secrets: ['password'],
			last_test: null
		});
		expect(created.json.settings).toMatchObject({
			host: database.hostname,
			ssl: 'disable',
			ssh: { enabled: false, port: 22, fingerprint: '' }
		});
		expect(JSON.stringify(created.json)).not.toContain(decodeURIComponent(database.password));
		const id = String(created.json.id);

		const s3 = await call('POST', '/data-sources', writer, {
			name: 'Backups',
			type: 's3',
			settings: { bucket: 'backups', access_key_id: 'AKIA', path_style: false },
			secrets: { secret_access_key: 'shh' }
		});
		expect(s3.status).toBe(201);
		expect(s3.json.settings).toMatchObject({ access_key_id: 'AKIA', path_style: false });
		expect(s3.json.secrets).toEqual(['secret_access_key']);

		const listed = await call('GET', '/data-sources?type=s3', writer);
		expect((listed.json.data as { name: string }[]).map((item) => item.name)).toEqual([
			'Backups'
		]);
		expect((await call('GET', `/data-sources/${id}`, writer)).json.name).toBe('Test database');

		const renamed = await call('PATCH', `/data-sources/${id}`, writer, {
			name: 'Test DB',
			docs_url: null
		});
		expect(renamed.status).toBe(200);
		expect(renamed.json).toMatchObject({
			name: 'Test DB',
			docs_url: null,
			description: 'The integration tests run here.',
			secrets: ['password']
		});
		expect((renamed.json.settings as { host: string }).host).toBe(database.hostname);

		expect((await call('DELETE', `/data-sources/${id}`, writer)).status).toBe(204);
		expect((await call('GET', `/data-sources/${id}`, writer)).status).toBe(404);
		expect(await lastAudit('data_source.delete')).toMatchObject({ targetId: id });
	});

	it('names refused fields as the request named them', async () => {
		const refused = await call('POST', '/data-sources', writer, {
			name: 'Broken',
			type: 'mysql',
			docs_url: 'ftp://docs',
			settings: { host: 'db', username: 'u', ssh: { enabled: true } },
			secrets: { ssh_password: 'x'.repeat(2000) }
		});
		expect(refused.status).toBe(422);
		expect(Object.keys((refused.json.error as { fields: object }).fields).sort()).toEqual([
			'docs_url',
			'secrets.ssh_password',
			'settings.ssh.host',
			'settings.ssh.username'
		]);
	});

	it('hands out secrets only with their own scope, and records every read', async () => {
		const id = String((await addDatabase()).json.id);
		expect((await call('GET', `/data-sources/${id}/secrets`, writer)).status).toBe(403);

		const reader = await keyWith(['datasources:secrets']);
		const secrets = await call('GET', `/data-sources/${id}/secrets`, reader);
		expect(secrets.status).toBe(200);
		expect(secrets.json).toEqual({
			secrets: { password: decodeURIComponent(database.password) },
			connection_url: expect.stringMatching(/^postgresql:\/\//)
		});
		expect(await lastAudit('data_source.reveal')).toMatchObject({
			actorType: 'api_key',
			targetId: id
		});
		// The secrets scope does not open the rest.
		expect((await call('GET', '/data-sources', reader)).status).toBe(403);
	});

	it('tests a source and keeps the outcome', async () => {
		const id = String((await addDatabase()).json.id);
		const reader = await keyWith(['datasources:read']);
		expect((await call('POST', `/data-sources/${id}/test`, reader)).status).toBe(403);
		const tested = await call('POST', `/data-sources/${id}/test`, writer);
		expect(tested.status).toBe(200);
		expect(tested.json).toMatchObject({ ok: true, duration_ms: expect.any(Number) });
		expect((await call('GET', `/data-sources/${id}`, reader)).json.last_test).toMatchObject({
			ok: true
		});
		expect(await lastAudit('data_source.test')).toMatchObject({ targetId: id });
	});
});

describe('the data sources MCP tools', () => {
	it('lists only the tools the scopes allow', async () => {
		const reading = await (await mcpWith(['datasources:read'])).listTools();
		expect(reading.tools.map((item) => item.name).sort()).toEqual([
			'get_data_source',
			'list_data_sources',
			'list_tags',
			'search'
		]);
		const secrets = await (await mcpWith(['datasources:secrets'])).listTools();
		expect(secrets.tools.map((item) => item.name).sort()).toEqual([
			'get_data_source_secrets',
			'list_tags',
			'search'
		]);
	});

	it('finds a source, reads its secrets and tests it', async () => {
		const id = String((await addDatabase()).json.id);
		const client = await mcpWith([
			'datasources:read',
			'datasources:secrets',
			'datasources:write'
		]);

		const listed = await tool(client, 'list_data_sources', { type: 'postgresql' });
		expect((listed.data.data as { id: string }[]).map((item) => item.id)).toEqual([id]);
		expect((await tool(client, 'get_data_source', { id })).data).toMatchObject({
			name: 'Test database',
			secrets: ['password']
		});

		const revealed = await tool(client, 'get_data_source_secrets', { id });
		expect(revealed.data).toMatchObject({
			secrets: { password: decodeURIComponent(database.password) }
		});
		expect(await lastAudit('data_source.reveal')).toMatchObject({ targetId: id });

		const tested = await tool(client, 'test_data_source', { id });
		expect(tested.data).toMatchObject({ ok: true });

		const found = await tool(client, 'search', { query: 'Test database' });
		expect(found.data).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ type: 'data_source', id, link: `/data-sources/${id}` })
			])
		);
	});
});
