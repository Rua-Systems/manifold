import { ownerActor, type Actor } from '$lib/server/actor';
import { createApiKey } from '$lib/server/api-keys';
import { getDb } from '$lib/server/db';
import { apiKey, tag } from '$lib/server/db/schema';
import { ConflictError, NotFoundError, ValidationError } from '$lib/server/errors';
import { createTag } from '$lib/server/tags/tags';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { markdownToNote } from '../notes/markdown.server';
import {
	FULL_ACCESS,
	keyCategoryLabels,
	limitKeyToCategories,
	memoryAccessFor
} from './access.server';
import { categoryLabel, categoryTree } from './categories';
import {
	allMemoryCategories,
	createMemoryCategory,
	deleteMemoryCategory,
	memoryCountsByCategory,
	renameMemoryCategory
} from './categories.server';
import { markdownToMemory } from './content.server';
import {
	createMemory,
	deleteMemoryPermanently,
	getMemory,
	listMemories,
	listMemoryRevisions,
	pinnedMemories,
	purgeTrashedMemories,
	restoreMemory,
	restoreMemoryRevision,
	searchMemories,
	trashMemory,
	updateMemory
} from './memories.server';
import { memory, memoryCategory, memoryKeyCategory } from './schema.server';

const OWNER: Actor = ownerActor('owner-id');

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

function text(markdown: string) {
	return markdownToNote(markdown);
}

beforeEach(async () => {
	await getDb().delete(memory);
	await getDb().delete(memoryKeyCategory);
	await getDb().delete(apiKey);
	await getDb().delete(tag);
});

/** Subcategories first: their parents cannot go while they exist. */
async function clearCategories() {
	const all = await allMemoryCategories();
	for (const category of all.filter((item) => item.parentId !== null)) {
		await getDb().delete(memoryCategory).where(eq(memoryCategory.id, category.id));
	}
	await getDb().delete(memoryCategory);
}

beforeEach(clearCategories);

describe('memory categories', () => {
	it('keeps two levels, one name per place, and lists them as a tree', async () => {
		const work = await createMemoryCategory({ name: 'Work', parentId: null });
		const atlas = await createMemoryCategory({ name: 'Atlas', parentId: work.id });
		await createMemoryCategory({ name: 'Atlas', parentId: null });

		expect(await fieldsOf(createMemoryCategory({ name: 'atlas', parentId: work.id }))).toEqual({
			name: 'A category here already has this name.'
		});
		expect(await fieldsOf(createMemoryCategory({ name: 'Deep', parentId: atlas.id }))).toEqual({
			parent: 'A subcategory cannot hold further categories.'
		});
		expect(
			await fieldsOf(
				createMemoryCategory({
					name: 'Lost',
					parentId: '00000000-0000-4000-8000-000000000000'
				})
			)
		).toEqual({ parent: 'This category no longer exists.' });

		const renamed = await renameMemoryCategory(atlas.id, 'Atlas Project');
		expect(renamed).toMatchObject({ name: 'Atlas Project', parentId: work.id });

		const categories = await allMemoryCategories();
		expect(categoryLabel(categories, atlas.id)).toBe('Work / Atlas Project');
		expect(categoryLabel(categories, work.id)).toBe('Work');
		expect(categoryLabel(categories, null)).toBe('');
		const tree = categoryTree(categories, { [atlas.id]: 2 });
		expect(tree.map((node) => node.name)).toEqual(['Atlas', 'Work']);
		expect(tree[1].children).toEqual([expect.objectContaining({ id: atlas.id, count: 2 })]);
	});

	it('deletes only empty categories that no key is limited to', async () => {
		const work = await createMemoryCategory({ name: 'Work', parentId: null });
		const atlas = await createMemoryCategory({ name: 'Atlas', parentId: work.id });
		const filed = await createMemory({ title: 'Deploys', categoryId: atlas.id }, OWNER);

		expect(await fieldsOf(deleteMemoryCategory(work.id))).toEqual({
			category: 'Move or trash the memories and subcategories in it first.'
		});
		expect(await fieldsOf(deleteMemoryCategory(atlas.id))).toHaveProperty('category');

		// A memory in the trash does not keep its category; it loses it instead.
		await trashMemory(filed.id);
		const { key, view } = await createApiKey({
			name: 'Limited',
			scopes: ['memory:read'],
			expiresAt: null
		});
		expect(key).toMatch(/^mfd_/);
		await getDb().transaction((tx) => limitKeyToCategories(tx, view.id, [atlas.id]));
		expect(await fieldsOf(deleteMemoryCategory(atlas.id))).toEqual({
			category: 'An API key is limited to this category. Delete that key first.'
		});

		await getDb().delete(apiKey).where(eq(apiKey.id, view.id));
		await deleteMemoryCategory(atlas.id);
		await deleteMemoryCategory(work.id);
		expect(await getMemory(filed.id, { includeTrashed: true })).toMatchObject({
			categoryId: null
		});
		await expect(deleteMemoryCategory(work.id)).rejects.toBeInstanceOf(NotFoundError);
	});
});

describe('memories', () => {
	it('writes a memory with a category, tags and a pin, and lists pinned ones first', async () => {
		const work = await createMemoryCategory({ name: 'Work', parentId: null });
		const style = await createTag({ name: 'style', color: 'blue' });
		const first = await createMemory(
			{
				title: 'Commit style',
				content: text('Use the imperative mood.'),
				categoryId: work.id,
				tags: [style],
				pinned: true
			},
			OWNER
		);
		expect(first).toMatchObject({ version: 1, pinned: true, categoryId: work.id });
		expect(first.tags).toEqual([style]);
		await createMemory({ title: 'Later', content: text('Newer but not pinned.') }, OWNER);

		expect((await listMemories()).map((item) => item.title)).toEqual(['Commit style', 'Later']);
		expect((await listMemories({ tagIds: [style.id] })).map((item) => item.title)).toEqual([
			'Commit style'
		]);
		expect(await listMemories({ uncategorized: true })).toHaveLength(1);
		expect(await listMemories({ pinned: true })).toHaveLength(1);
		expect(await listMemories({ categoryIds: [] })).toEqual([]);
		expect((await memoryCountsByCategory())[work.id]).toBe(1);

		expect(await fieldsOf(createMemory({ title: '  ' }, OWNER))).toEqual({
			title: 'This field is required.'
		});
		expect(await fieldsOf(createMemory({ title: 'Lost', categoryId: 'nope' }, OWNER))).toEqual({
			category: 'This category no longer exists.'
		});
	});

	it('refuses images, in JSON and in Markdown', async () => {
		const image = {
			type: 'doc',
			content: [
				{
					type: 'image',
					attrs: { src: '/files/00000000-0000-4000-8000-000000000000' }
				}
			]
		};
		expect(await fieldsOf(createMemory({ title: 'Image', content: image }, OWNER))).toEqual({
			content: 'Memories hold text only. Keep images in notes or files and link to them.'
		});
		expect(() => markdownToMemory('![x](/files/00000000-0000-4000-8000-000000000000)')).toThrow(
			ValidationError
		);
		expect(
			markdownToMemory('[a file](/files/00000000-0000-4000-8000-000000000000)')
		).toBeTruthy();
	});

	it('versions text changes, keeps metadata changes in place, and reports conflicts', async () => {
		const created = await createMemory({ title: 'Plan', content: text('one') }, OWNER);

		const pinned = await updateMemory(created.id, { pinned: true }, OWNER);
		expect(pinned).toMatchObject({ version: 1, pinned: true });

		const same = await updateMemory(
			created.id,
			{ baseVersion: 1, title: 'Plan', content: created.content },
			OWNER
		);
		expect(same.version).toBe(1);

		const changed = await updateMemory(
			created.id,
			{ baseVersion: 1, content: text('two') },
			OWNER
		);
		expect(changed.version).toBe(2);
		await expect(
			updateMemory(created.id, { baseVersion: 1, title: 'Stale' }, OWNER)
		).rejects.toBeInstanceOf(ConflictError);
		expect(await fieldsOf(updateMemory(created.id, { title: 'No version' }, OWNER))).toEqual({
			version: 'Send the version the change is based on.'
		});
	});

	it('keeps revisions with their writer, and restores one as a new version', async () => {
		const { view } = await createApiKey({
			name: 'Claude Code',
			scopes: ['memory:write'],
			expiresAt: null
		});
		const agent: Actor = { type: 'api_key', id: view.id };
		const created = await createMemory({ title: 'Facts', content: text('first') }, OWNER);
		await updateMemory(created.id, { baseVersion: 1, content: text('owner edit') }, OWNER);
		const byAgent = await updateMemory(
			created.id,
			{ baseVersion: 2, content: text('agent edit') },
			agent
		);
		expect(byAgent.version).toBe(3);

		// The owner's two writes within five minutes share one revision; the agent's is its own.
		const revisions = await listMemoryRevisions(created.id);
		expect(revisions.map((item) => [item.version, item.actorType, item.actorName])).toEqual([
			[3, 'api_key', 'Claude Code'],
			[2, 'owner', null]
		]);

		const restored = await restoreMemoryRevision(created.id, 2, OWNER);
		expect(restored.version).toBe(4);
		expect(JSON.stringify(restored.content)).toContain('owner edit');

		await getDb().delete(apiKey).where(eq(apiKey.id, view.id));
		const afterDelete = await listMemoryRevisions(created.id);
		expect(afterDelete.find((item) => item.version === 3)?.actorName).toBeNull();
	});

	it('trashes, restores, deletes for good and purges old trash', async () => {
		const kept = await createMemory({ title: 'Kept' }, OWNER);
		const gone = await createMemory({ title: 'Gone' }, OWNER);

		expect(await fieldsOf(deleteMemoryPermanently(kept.id))).toHaveProperty('memory');
		await trashMemory(kept.id);
		await trashMemory(gone.id, FULL_ACCESS, new Date(Date.now() - 40 * 24 * 60 * 60 * 1000));
		await expect(getMemory(kept.id)).rejects.toBeInstanceOf(NotFoundError);
		expect((await listMemories({ trashed: true })).map((item) => item.title)).toEqual([
			'Kept',
			'Gone'
		]);

		expect(await purgeTrashedMemories(new Date(), 30)).toBe(1);
		const back = await restoreMemory(kept.id);
		expect(back.deletedAt).toBeNull();

		await trashMemory(kept.id);
		await deleteMemoryPermanently(kept.id);
		await expect(getMemory(kept.id, { includeTrashed: true })).rejects.toBeInstanceOf(
			NotFoundError
		);
	});

	it('finds memories by words and offers the pinned ones as context', async () => {
		await createMemory(
			{ title: 'Deployment checklist', content: text('Run migrations before the image.') },
			OWNER
		);
		await createMemory(
			{ title: 'Preferences', content: text('Turkish replies.'), pinned: true },
			OWNER
		);

		const hits = await searchMemories('migrations', 5);
		expect(hits.map((hit) => hit.title)).toEqual(['Deployment checklist']);
		expect(hits[0].snippet).toContain('migrations');
		expect(await searchMemories('   ', 5)).toEqual([]);
		expect((await pinnedMemories()).map((item) => item.title)).toEqual(['Preferences']);
	});
});

describe('keys limited to categories', () => {
	it('reach only their categories and subcategories, and write only there', async () => {
		const work = await createMemoryCategory({ name: 'Work', parentId: null });
		const atlas = await createMemoryCategory({ name: 'Atlas', parentId: work.id });
		const home = await createMemoryCategory({ name: 'Home', parentId: null });
		const inAtlas = await createMemory({ title: 'Atlas note', categoryId: atlas.id }, OWNER);
		const inHome = await createMemory(
			{ title: 'Home note', categoryId: home.id, pinned: true },
			OWNER
		);
		await createMemory({ title: 'Loose note', pinned: true }, OWNER);

		const { view } = await createApiKey({
			name: 'Work agent',
			scopes: ['memory:read', 'memory:write'],
			expiresAt: null
		});
		await getDb().transaction((tx) => limitKeyToCategories(tx, view.id, [work.id]));
		const access = await memoryAccessFor({ ...view, expiresAt: null });
		expect(access.all).toBe(false);
		expect(access.categoryIds.sort()).toEqual([work.id, atlas.id].sort());
		expect(await keyCategoryLabels()).toEqual({ [view.id]: ['Work'] });

		expect((await listMemories({}, {}, access)).map((item) => item.title)).toEqual([
			'Atlas note'
		]);
		await expect(getMemory(inHome.id, {}, access)).rejects.toBeInstanceOf(NotFoundError);
		await expect(trashMemory(inHome.id, access)).rejects.toBeInstanceOf(NotFoundError);
		expect(await searchMemories('note', 10, access)).toHaveLength(1);
		expect(await pinnedMemories(access)).toEqual([]);

		const agent: Actor = { type: 'api_key', id: view.id };
		expect(await fieldsOf(createMemory({ title: 'Loose' }, agent, access))).toEqual({
			category: 'This key may only file memories in its categories.'
		});
		expect(
			await fieldsOf(createMemory({ title: 'Elsewhere', categoryId: home.id }, agent, access))
		).toEqual({ category: 'This category no longer exists.' });
		expect(
			await fieldsOf(updateMemory(inAtlas.id, { categoryId: null }, agent, access))
		).toHaveProperty('category');
		const moved = await updateMemory(inAtlas.id, { categoryId: work.id }, agent, access);
		expect(moved.categoryId).toBe(work.id);

		expect(
			await fieldsOf(
				getDb().transaction((tx) =>
					limitKeyToCategories(tx, view.id, ['00000000-0000-4000-8000-000000000000'])
				)
			)
		).toEqual({ memoryCategories: 'This category no longer exists.' });
	});
});
