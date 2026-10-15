import { createApiKey } from '$lib/server/api-keys';
import { handleApiRequest } from '$lib/server/api/router';
import { getDb } from '$lib/server/db';
import { apiKey, tag } from '$lib/server/db/schema';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { handleMcpRequest } from '$lib/server/mcp/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTag, deleteTag, getTag, listTags, tagsByIds, tagsByNames, updateTag } from './tags';

const clients: Client[] = [];

beforeEach(async () => {
	await getDb().delete(tag);
	await getDb().delete(apiKey);
});

afterEach(async () => {
	while (clients.length > 0) {
		await clients.pop()?.close();
	}
});

async function keyWith(scopes: string[]): Promise<string> {
	return (await createApiKey({ name: 'Tags', scopes, expiresAt: null })).key;
}

async function fieldsOf(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (cause) {
		if (cause instanceof ValidationError) {
			return cause.fields;
		}
		throw cause;
	}
	throw new Error('Expected a validation error.');
}

describe('tags', () => {
	it('keeps one tag per name whatever its case and lists them by name', async () => {
		await createTag({ name: 'work', color: 'blue' });
		await createTag({ name: 'Atlas', color: 'green' });
		await createTag({ name: 'banking', color: 'red' });

		expect((await listTags()).map((item) => item.name)).toEqual(['Atlas', 'banking', 'work']);
		expect(await fieldsOf(createTag({ name: 'WORK', color: 'gray' }))).toEqual({
			name: 'A tag already has this name.'
		});
	});

	it('validates names and colors, renames and recolors, and deletes', async () => {
		expect(await fieldsOf(createTag({ name: '  ', color: 'gray' }))).toHaveProperty('name');
		expect(await fieldsOf(createTag({ name: 'a/b', color: 'gray' }))).toHaveProperty('name');
		expect(await fieldsOf(createTag({ name: 'ok', color: 'purple' }))).toEqual({
			color: 'Choose one of the colors.'
		});

		const created = await createTag({ name: ' meb ', color: 'teal' });
		expect(created).toMatchObject({ name: 'meb', color: 'teal' });
		const other = await createTag({ name: 'oft', color: 'gray' });

		const renamed = await updateTag(created.id, { name: 'MEB', color: 'amber' });
		expect(renamed).toMatchObject({ id: created.id, name: 'MEB', color: 'amber' });
		expect(await fieldsOf(updateTag(other.id, { name: 'meb', color: 'gray' }))).toEqual({
			name: 'A tag already has this name.'
		});

		await deleteTag(created.id);
		await expect(getTag(created.id)).rejects.toBeInstanceOf(NotFoundError);
		await expect(deleteTag(created.id)).rejects.toBeInstanceOf(NotFoundError);
		await expect(updateTag('not an id', { name: 'x', color: 'gray' })).rejects.toBeInstanceOf(
			NotFoundError
		);
	});

	it('finds tags by name in any case and refuses names that are not tags', async () => {
		const work = await createTag({ name: 'Work', color: 'blue' });
		const atlas = await createTag({ name: 'Atlas', color: 'green' });

		const found = await tagsByNames(['work', ' ATLAS ', 'Work', '']);
		expect(found.map((item) => item.id).sort()).toEqual([work.id, atlas.id].sort());
		expect(await tagsByNames([])).toEqual([]);
		expect(await fieldsOf(tagsByNames(['work', 'Home', 'garden']))).toEqual({
			tags: 'No tag is named Home, garden. Tags are made in Settings → Tags.'
		});
		const many = Array.from({ length: 21 }, (_, index) => `tag ${index}`);
		expect(await fieldsOf(tagsByNames(many))).toEqual({ tags: 'Use at most 20 tags.' });
	});

	it('finds tags by id and refuses ids that name no tag', async () => {
		const work = await createTag({ name: 'Work', color: 'blue' });

		expect(await tagsByIds([work.id, work.id])).toEqual([work]);
		expect(await tagsByIds([])).toEqual([]);
		expect(
			await fieldsOf(tagsByIds([work.id, '00000000-0000-4000-8000-000000000000']))
		).toEqual({ tags: 'A chosen tag no longer exists.' });
		expect(await fieldsOf(tagsByIds(['nope']))).toEqual({
			tags: 'A chosen tag no longer exists.'
		});
	});
});

describe('tags through the API and MCP', () => {
	it('lists tags to any key in pages, and offers list_tags to every key', async () => {
		for (const name of ['c', 'a', 'b']) {
			await createTag({ name, color: 'gray' });
		}
		const key = await keyWith(['usage:read']);

		const first = await handleApiRequest(
			new Request('http://localhost:4173/api/v1/tags?limit=2', {
				headers: { authorization: `Bearer ${key}` }
			}),
			{ origin: { ip: '10.7.7.7', userAgent: 'vitest' } }
		);
		expect(first.status).toBe(200);
		const page = (await first.json()) as {
			data: { name: string; color: string }[];
			next_cursor: string | null;
		};
		expect(page.data.map((item) => item.name)).toEqual(['a', 'b']);
		expect(page.data[0]).toMatchObject({ color: 'gray' });
		expect(page.next_cursor).not.toBeNull();

		const second = await handleApiRequest(
			new Request(`http://localhost:4173/api/v1/tags?limit=2&cursor=${page.next_cursor}`, {
				headers: { authorization: `Bearer ${key}` }
			}),
			{ origin: { ip: '10.7.7.7', userAgent: 'vitest' } }
		);
		expect(((await second.json()) as { data: { name: string }[] }).data).toEqual([
			expect.objectContaining({ name: 'c' })
		]);

		const transport = new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
			requestInit: { headers: { authorization: `Bearer ${key}` } },
			fetch: (url, init) =>
				handleMcpRequest(new Request(url, init), {
					origin: { ip: '10.7.7.8', userAgent: 'mcp-test' }
				})
		});
		const client = new Client({ name: 'test', version: '1.0.0' });
		await client.connect(transport);
		clients.push(client);

		const tools = await client.listTools();
		expect(tools.tools.map((item) => item.name)).toContain('list_tags');
		const answer = (await client.callTool({ name: 'list_tags', arguments: {} })) as {
			content: { text: string }[];
		};
		expect(JSON.parse(answer.content[0].text)).toEqual({
			data: [
				expect.objectContaining({ name: 'a' }),
				expect.objectContaining({ name: 'b' }),
				expect.objectContaining({ name: 'c' })
			]
		});
	});
});
