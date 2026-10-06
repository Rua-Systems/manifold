import { note } from '$lib/modules/notes/schema.server';
import { service } from '$lib/modules/services/schema.server';
import { vaultSecret } from '$lib/modules/vault/schema.server';
import { createNote } from '$lib/modules/notes/notes.server';
import { createNoteToken } from '$lib/modules/notes/tokens.server';
import { createSecret } from '$lib/modules/vault/vault.server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ownerActor } from '../actor';
import { createApiKey } from '../api-keys';
import { getDb } from '../db';
import { purgeAuditEvents } from '../audit';
import { auditEvent } from '../db/schema';
import { handleMcpRequest, mcpTools } from './server';

const ALL_SCOPES = [
	'notes:read',
	'notes:write',
	'map:read',
	'map:write',
	'services:read',
	'services:write',
	'vault:read',
	'usage:read'
];

const clients: Client[] = [];

/** An MCP client whose requests go straight to the handler, as over HTTP. */
async function connect(scopes: string[]): Promise<Client> {
	const { key } = await createApiKey({ name: 'Agent', scopes, expiresAt: null });
	return connectWith(key);
}

async function connectWith(key: string): Promise<Client> {
	const transport = new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
		requestInit: { headers: { authorization: `Bearer ${key}` } },
		fetch: (url, init) =>
			handleMcpRequest(new Request(url, init), {
				origin: { ip: '10.7.7.7', userAgent: 'mcp-test' }
			})
	});
	const client = new Client({ name: 'test', version: '1.0.0' });
	await client.connect(transport);
	clients.push(client);
	return client;
}

interface ToolAnswer {
	isError?: boolean;
	content: { type: string; text: string }[];
}

async function call(client: Client, name: string, args: Record<string, unknown>) {
	const answer = (await client.callTool({ name, arguments: args })) as ToolAnswer;
	return { isError: answer.isError === true, data: JSON.parse(answer.content[0].text) as never };
}

beforeEach(async () => {
	await getDb().delete(note);
	await getDb().delete(service);
	await getDb().delete(vaultSecret);
	await purgeAuditEvents(new Date(Date.now() + 60_000), 0);
});

afterEach(async () => {
	while (clients.length > 0) {
		await clients.pop()?.close();
	}
});

describe('MCP', () => {
	it('refuses requests without a valid key', async () => {
		const response = await handleMcpRequest(
			new Request('http://localhost/mcp', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					accept: 'application/json, text/event-stream'
				},
				body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
			}),
			{ origin: { ip: null, userAgent: null } }
		);
		expect(response.status).toBe(401);
	});

	it('lists only the tools the key may use', async () => {
		const all = await (await connect(ALL_SCOPES)).listTools();
		expect(all.tools.map((tool) => tool.name).sort()).toEqual(
			mcpTools()
				.map((tool) => tool.name)
				.sort()
		);

		const readOnly = await (await connect(['notes:read'])).listTools();
		expect(readOnly.tools.map((tool) => tool.name).sort()).toEqual([
			'get_note',
			'list_note_revisions',
			'list_notes',
			'search'
		]);
		for (const tool of all.tools) {
			expect(tool.description, tool.name).toMatch(/scope|key may read/);
		}
	});

	it('refuses a tool outside the key scopes', async () => {
		const client = await connect(['notes:read']);
		const answer = (await client.callTool({
			name: 'create_note',
			arguments: { title: 'Nope' }
		})) as ToolAnswer;
		expect(answer.isError).toBe(true);
		expect(await getDb().select().from(note)).toHaveLength(0);
	});

	it('writes and reads notes in Markdown and reports version conflicts', async () => {
		const client = await connect(ALL_SCOPES);
		const created = await call(client, 'create_note', {
			title: 'Agent notes',
			markdown: '# Plan\n\n- one'
		});
		expect(created.isError).toBe(false);
		const { id, version } = created.data as { id: string; version: number };
		expect(created.data).not.toHaveProperty('content');

		const read = await call(client, 'get_note', { id });
		expect(read.data).toMatchObject({ title: 'Agent notes', markdown: '# Plan\n\n- one' });

		const updated = await call(client, 'update_note', {
			id,
			version,
			markdown: '# Plan\n\n- two'
		});
		expect(updated.data).toMatchObject({ version: 2 });

		const stale = await call(client, 'update_note', { id, version, markdown: 'late' });
		expect(stale.isError).toBe(true);
		expect(stale.data).toEqual({
			error: {
				code: 'version_conflict',
				message: 'The record changed since that version.',
				current_version: 2
			}
		});

		const listed = await call(client, 'list_notes', { query: 'agent' });
		expect((listed.data as { data: { id: string }[] }).data.map((item) => item.id)).toEqual([
			id
		]);
		const revisions = await call(client, 'list_note_revisions', { id });
		expect((revisions.data as { data: unknown[] }).data).toHaveLength(2);

		expect((await call(client, 'trash_note', { id })).data).toEqual({ id, trashed: true });
		expect((await call(client, 'restore_note', { id })).data).toMatchObject({ id });

		const [event] = await getDb()
			.select()
			.from(auditEvent)
			.where(eq(auditEvent.action, 'note.update'));
		expect(event).toMatchObject({
			actorType: 'api_key',
			targetId: id,
			metadata: { via: 'mcp' }
		});
	});

	it('manages services and map features, and lists vault names only', async () => {
		const client = await connect(ALL_SCOPES);
		const created = await call(client, 'create_service', {
			alias: 'Grafana',
			url: 'https://grafana.example.com'
		});
		const serviceId = (created.data as { id: string }).id;
		expect(
			(await call(client, 'update_service', { id: serviceId, alias: 'Grafana prod' })).data
		).toMatchObject({ alias: 'Grafana prod' });
		expect(
			(
				(await call(client, 'list_services', {})).data as { data: { alias: string }[] }
			).data.map((item) => item.alias)
		).toEqual(['Grafana prod']);
		expect((await call(client, 'delete_service', { id: serviceId })).data).toMatchObject({
			deleted: true
		});

		const feature = await call(client, 'create_map_feature', {
			geometry: { type: 'Point', coordinates: [28.97, 41.01] },
			note_title: 'Pier',
			note_markdown: 'Ferries every hour'
		});
		expect(feature.data).toMatchObject({ properties: { note_title: 'Pier', kind: 'point' } });
		const featureId = (feature.data as { id: string }).id;
		const moved = await call(client, 'update_map_feature', {
			id: featureId,
			geometry: { type: 'Point', coordinates: [29, 41] }
		});
		expect(moved.data).toMatchObject({ geometry: { coordinates: [29, 41] } });
		const invalid = await call(client, 'update_map_feature', {
			id: featureId,
			geometry: {
				type: 'LineString',
				coordinates: [
					[0, 0],
					[1, 1]
				]
			}
		});
		expect(invalid.isError).toBe(true);
		const listed = await call(client, 'list_map_features', { bbox: '28,40,30,42' });
		expect((listed.data as { features: unknown[] }).features).toHaveLength(1);
		expect((await call(client, 'delete_map_feature', { id: featureId })).data).toMatchObject({
			deleted: true
		});

		await createSecret({
			name: 'Grafana admin',
			serviceUrl: '',
			description: '',
			value: 'never-shown-value'
		});
		const secrets = await call(client, 'list_vault_secrets', {});
		expect(JSON.stringify(secrets.data)).toContain('Grafana admin');
		expect(JSON.stringify(secrets.data)).not.toContain('never-shown-value');

		const hits = await call(client, 'search', { query: 'grafana' });
		expect((hits.data as { type: string }[]).map((hit) => hit.type)).toEqual(['secret']);
	});

	it('offers a note token the tools of its access, on its own note only', async () => {
		const target = await createNote({ title: 'Shared with an agent' }, ownerActor('owner-1'));
		const other = await createNote({ title: 'Not shared' }, ownerActor('owner-1'));
		const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
		const read = await createNoteToken({
			noteId: target.id,
			name: 'Reader',
			access: 'read',
			expiresAt
		});
		const edit = await createNoteToken({
			noteId: target.id,
			name: 'Editor',
			access: 'edit',
			expiresAt
		});

		const reader = await connectWith(read.token);
		expect((await reader.listTools()).tools.map((tool) => tool.name)).toEqual(['get_note']);
		expect((await call(reader, 'get_note', { id: target.id })).data).toMatchObject({
			title: 'Shared with an agent'
		});
		const refused = await call(reader, 'get_note', { id: other.id });
		expect(refused.isError).toBe(true);
		expect(refused.data).toMatchObject({ error: { code: 'not_found' } });

		const editor = await connectWith(edit.token);
		expect((await editor.listTools()).tools.map((tool) => tool.name).sort()).toEqual([
			'get_note',
			'update_note'
		]);
		const updated = await call(editor, 'update_note', {
			id: target.id,
			version: 1,
			title: 'Changed by an agent'
		});
		expect(updated.data).toMatchObject({ title: 'Changed by an agent', version: 2 });
	});

	it('reports usage to a key with usage:read', async () => {
		const usage = await call(await connect(['usage:read']), 'get_usage', {});
		expect(usage.isError).toBe(false);
		expect(usage.data).toMatchObject({
			measured_at: expect.any(String),
			database: { bytes: expect.any(Number) },
			process: { node_version: process.version }
		});

		const tools = await (await connect(['notes:read'])).listTools();
		expect(tools.tools.map((tool) => tool.name)).not.toContain('get_usage');
	});
});
