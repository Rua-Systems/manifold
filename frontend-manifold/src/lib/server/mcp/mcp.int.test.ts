import { note } from '$lib/modules/notes/schema.server';
import { service } from '$lib/modules/services/schema.server';
import { vaultSecret } from '$lib/modules/vault/schema.server';
import { createSecret } from '$lib/modules/vault/vault.server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApiKey } from '../api-keys';
import { getDb } from '../db';
import { auditEvent } from '../db/schema';
import { handleMcpRequest, mcpTools } from './server';

const ALL_SCOPES = [
	'notes:read',
	'notes:write',
	'map:read',
	'map:write',
	'services:read',
	'services:write',
	'vault:read'
];

const clients: Client[] = [];

/** An MCP client whose requests go straight to the handler, as over HTTP. */
async function connect(scopes: string[]): Promise<Client> {
	const { key } = await createApiKey({ name: 'Agent', scopes, expiresAt: null });
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
	await getDb().delete(auditEvent);
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
});
