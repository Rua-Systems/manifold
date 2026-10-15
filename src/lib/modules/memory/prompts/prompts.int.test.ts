import { createApiKey } from '$lib/server/api-keys';
import { handleApiRequest } from '$lib/server/api/router';
import { getDb } from '$lib/server/db';
import { apiKey, tag } from '$lib/server/db/schema';
import { ConflictError, NotFoundError, ValidationError } from '$lib/server/errors';
import { handleMcpRequest } from '$lib/server/mcp/server';
import { createTag } from '$lib/server/tags/tags';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { isNotNull } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FULL_ACCESS, limitKeyToCategories, memoryAccessFor } from '../access.server';
import { createMemoryCategory, deleteMemoryCategory } from '../categories.server';
import { memory, memoryCategory, memoryKeyCategory } from '../schema.server';
import {
	createPrompt,
	deletePrompt,
	getPrompt,
	getPromptByName,
	listPrompts,
	searchPrompts,
	updatePrompt
} from './prompts.server';
import { nameFromTitle } from './schemas';
import { memoryPrompt } from './schema.server';

const clients: Client[] = [];

beforeEach(async () => {
	await getDb().delete(memoryPrompt);
	await getDb().delete(memory);
	await getDb().delete(memoryKeyCategory);
	await getDb().delete(apiKey);
	await getDb().delete(memoryCategory).where(isNotNull(memoryCategory.parentId));
	await getDb().delete(memoryCategory);
	await getDb().delete(tag);
});

afterEach(async () => {
	while (clients.length > 0) {
		await clients.pop()?.close();
	}
});

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

const REVIEW = {
	name: 'code-review',
	title: 'Code review',
	description: 'Review a change.',
	body: 'Review {{file}} for {{goal}}. Be brief about {{ file }}.'
};

async function mcpWith(key: string): Promise<Client> {
	const transport = new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
		requestInit: { headers: { authorization: `Bearer ${key}` } },
		fetch: (url, init) =>
			handleMcpRequest(new Request(url, init), {
				origin: { ip: '10.9.9.9', userAgent: 'mcp-test' }
			})
	});
	const client = new Client({ name: 'test', version: '1.0.0' });
	await client.connect(transport);
	clients.push(client);
	return client;
}

describe('prompts', () => {
	it('saves prompts with unique handles, variables, a category and tags', async () => {
		const work = await createMemoryCategory({ name: 'Work', parentId: null });
		const style = await createTag({ name: 'style', color: 'teal' });
		const created = await createPrompt({ ...REVIEW, categoryId: work.id, tags: [style] });
		expect(created).toMatchObject({
			name: 'code-review',
			variables: ['file', 'goal'],
			categoryId: work.id,
			version: 1
		});
		expect(created.tags).toEqual([style]);

		expect(await fieldsOf(createPrompt(REVIEW))).toEqual({
			name: 'A prompt already has this handle.'
		});
		expect(await fieldsOf(createPrompt({ ...REVIEW, name: 'Code Review' }))).toHaveProperty(
			'name'
		);
		expect(await fieldsOf(createPrompt({ ...REVIEW, name: 'other', body: '   ' }))).toEqual({
			body: 'This field is required.'
		});
		const many = Array.from({ length: 21 }, (_, index) => `{{v${index}}}`).join(' ');
		expect(
			await fieldsOf(createPrompt({ ...REVIEW, name: 'many', body: many }))
		).toHaveProperty('body');

		expect((await getPromptByName(' Code-Review ')).id).toBe(created.id);
		expect((await listPrompts({ query: 'brief' })).map((item) => item.name)).toEqual([
			'code-review'
		]);
		expect(await listPrompts({ tagIds: [style.id] })).toHaveLength(1);
		expect(await listPrompts({ uncategorized: true })).toEqual([]);
		expect((await searchPrompts('review', 5))[0]).toMatchObject({ id: created.id });

		// A category with prompts in it is not empty.
		expect(await fieldsOf(deleteMemoryCategory(work.id))).toHaveProperty('category');
	});

	it('changes prompts by version and deletes them', async () => {
		const created = await createPrompt(REVIEW);
		const changed = await updatePrompt(created.id, {
			baseVersion: 1,
			body: 'Only {{goal}} now.'
		});
		expect(changed).toMatchObject({ version: 2, variables: ['goal'] });
		await expect(
			updatePrompt(created.id, { baseVersion: 1, title: 'Stale' })
		).rejects.toBeInstanceOf(ConflictError);
		await deletePrompt(created.id);
		await expect(getPrompt(created.id)).rejects.toBeInstanceOf(NotFoundError);
	});

	it('keeps limited keys inside their categories', async () => {
		const work = await createMemoryCategory({ name: 'Work', parentId: null });
		const home = await createMemoryCategory({ name: 'Home', parentId: null });
		await createPrompt({ ...REVIEW, categoryId: work.id });
		const elsewhere = await createPrompt({
			...REVIEW,
			name: 'home-chores',
			categoryId: home.id
		});
		const { view } = await createApiKey({
			name: 'Limited',
			scopes: ['prompts:read'],
			expiresAt: null
		});
		await getDb().transaction((tx) => limitKeyToCategories(tx, view.id, [work.id]));
		const access = await memoryAccessFor({ ...view, expiresAt: null });

		expect((await listPrompts({}, access)).map((item) => item.name)).toEqual(['code-review']);
		await expect(getPrompt(elsewhere.id, access)).rejects.toBeInstanceOf(NotFoundError);
		await expect(getPromptByName('home-chores', access)).rejects.toBeInstanceOf(NotFoundError);
		expect(await fieldsOf(createPrompt({ ...REVIEW, name: 'loose' }, access))).toHaveProperty(
			'category'
		);
		expect((await listPrompts({}, FULL_ACCESS)).length).toBe(2);
	});

	it('makes handles from titles', () => {
		expect(nameFromTitle('Code Review!')).toBe('code-review');
		expect(nameFromTitle('  Günlük Özet: İş ')).toBe('gunluk-ozet-is');
		expect(nameFromTitle('***')).toBe('');
	});
});

describe('prompts through the API and MCP', () => {
	it('saves, fills in and offers prompts as MCP prompts and tools', async () => {
		await createTag({ name: 'review', color: 'blue' });
		const { key } = await createApiKey({
			name: 'Prompts',
			scopes: ['prompts:read', 'prompts:write'],
			expiresAt: null
		});
		const headers = { authorization: `Bearer ${key}`, 'content-type': 'application/json' };
		const created = await handleApiRequest(
			new Request('http://localhost:4173/api/v1/prompts', {
				method: 'POST',
				headers,
				body: JSON.stringify({
					title: 'Summarize a meeting',
					body: 'Summarize {{notes}} for {{audience}}.',
					tags: ['Review']
				})
			}),
			{ origin: { ip: '10.9.9.8', userAgent: 'vitest' } }
		);
		expect(created.status).toBe(201);
		const prompt = (await created.json()) as { id: string; name: string; tags: string[] };
		expect(prompt).toMatchObject({ name: 'summarize-a-meeting', tags: ['review'] });

		const rendered = await handleApiRequest(
			new Request(`http://localhost:4173/api/v1/prompts/${prompt.id}/render`, {
				method: 'POST',
				headers,
				body: JSON.stringify({ arguments: { notes: 'the notes' } })
			}),
			{ origin: { ip: '10.9.9.8', userAgent: 'vitest' } }
		);
		expect(await rendered.json()).toEqual({
			text: 'Summarize the notes for {{audience}}.',
			missing: ['audience']
		});

		const client = await mcpWith(key);
		const listed = await client.listPrompts();
		expect(listed.prompts).toEqual([
			expect.objectContaining({
				name: 'summarize-a-meeting',
				title: 'Summarize a meeting',
				arguments: [
					expect.objectContaining({ name: 'notes', required: true }),
					expect.objectContaining({ name: 'audience', required: true })
				]
			})
		]);
		const got = await client.getPrompt({
			name: 'summarize-a-meeting',
			arguments: { notes: 'standup', audience: 'the team' }
		});
		expect(got.messages[0]).toEqual({
			role: 'user',
			content: { type: 'text', text: 'Summarize standup for the team.' }
		});

		const answer = (await client.callTool({
			name: 'get_prompt',
			arguments: { name: 'summarize-a-meeting', arguments: { notes: 'x' } }
		})) as { content: { text: string }[] };
		expect(JSON.parse(answer.content[0].text)).toMatchObject({
			text: 'Summarize x for {{audience}}.',
			missing: ['audience']
		});
	});

	it('offers no prompts to a key without prompts:read', async () => {
		await createPrompt(REVIEW);
		const { key } = await createApiKey({
			name: 'Notes only',
			scopes: ['notes:read'],
			expiresAt: null
		});
		const client = await mcpWith(key);
		const capabilities = client.getServerCapabilities();
		expect(capabilities?.prompts).toBeUndefined();
	});
});
