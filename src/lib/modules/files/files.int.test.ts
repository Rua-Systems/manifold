import { createNote, deleteNotePermanently, trashNote } from '$lib/modules/notes/notes.server';
import { note } from '$lib/modules/notes/schema.server';
import { fileReferences } from '$lib/modules/registry.server';
import { createService } from '$lib/modules/services/services.server';
import { service } from '$lib/modules/services/schema.server';
import { ownerActor } from '$lib/server/actor';
import { getDb } from '$lib/server/db';
import { file } from '$lib/server/db/schema';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { purgeUnreferencedFiles, storeUpload } from '$lib/server/files/files';
import { receiveUploads } from '$lib/server/files/upload-stream';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	createFolder,
	deleteFile,
	deleteFolder,
	filterFiles,
	folderPath,
	getFileDetail,
	keepUploads,
	listFolder,
	listSource,
	listSources,
	moveFiles,
	moveFolder,
	renameFile,
	renameFolder,
	searchFiles
} from './library.server';
import { filesServerManifest } from './manifest.server';
import { fileEntry, fileFolder } from './schema.server';

const OWNER = ownerActor('owner-1');
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const DAY = 24 * 60 * 60 * 1000;

/** Uploads like the Files page does and keeps the files in a folder, or at the top. */
async function uploadToFiles(folderId: string | null, ...files: File[]): Promise<string[]> {
	const form = new FormData();
	for (const item of files) {
		form.append('file', item);
	}
	const received = await receiveUploads(
		new Request('http://localhost/files', { method: 'POST', body: form }),
		{ ownerModule: 'files', maxBytes: 1024 * 1024, maxFiles: 20, accept: 'any' }
	);
	const ids = received.files.map((item) => item.id);
	await keepUploads(ids, folderId);
	return ids;
}

beforeEach(async () => {
	await getDb().delete(note);
	await getDb().delete(service);
	await getDb().delete(fileEntry);
	await getDb().delete(fileFolder);
	await getDb().delete(file);
});

describe('folders', () => {
	it('nest, rename and keep names unique within their folder', async () => {
		const work = await createFolder({ name: 'Work', parentId: null });
		const plans = await createFolder({ name: 'Plans', parentId: work.id });
		await createFolder({ name: 'Plans', parentId: null });

		await expect(createFolder({ name: 'work', parentId: null })).rejects.toThrow(
			ValidationError
		);
		await expect(createFolder({ name: 'a/b', parentId: null })).rejects.toThrow(
			ValidationError
		);
		await expect(createFolder({ name: 'x', parentId: crypto.randomUUID() })).rejects.toThrow(
			NotFoundError
		);

		await renameFolder(plans.id, 'Drafts');
		expect((await folderPath(plans.id)).map((crumb) => crumb.name)).toEqual(['Work', 'Drafts']);
		const top = await listFolder(null, 'name');
		expect(top.folders.map((folder) => [folder.name, folder.itemCount])).toEqual([
			['Plans', 0],
			['Work', 1]
		]);
	});

	it('move anywhere but into themselves, and delete only when empty', async () => {
		const outer = await createFolder({ name: 'Outer', parentId: null });
		const inner = await createFolder({ name: 'Inner', parentId: outer.id });

		await expect(moveFolder(outer.id, inner.id)).rejects.toThrow(ValidationError);
		await expect(moveFolder(outer.id, outer.id)).rejects.toThrow(ValidationError);
		await expect(deleteFolder(outer.id)).rejects.toThrow(ValidationError);

		await moveFolder(inner.id, null);
		await deleteFolder(outer.id);
		const [kept] = await uploadToFiles(inner.id, new File(['notes'], 'a.txt'));
		await expect(deleteFolder(inner.id)).rejects.toThrow(ValidationError);
		await moveFiles([kept], null);
		await deleteFolder(inner.id);
		expect((await listFolder(null, 'newest')).folders).toEqual([]);
	});
});

describe('files', () => {
	it('lists the Files module by folder and other modules as sources', async () => {
		const folder = await createFolder({ name: 'Scans', parentId: null });
		const [scan] = await uploadToFiles(folder.id, new File(['%PDF-1.7 x'], 'scan.pdf'));
		await uploadToFiles(null, new File(['a,b'], 'table.csv'));
		const image = await storeUpload(new File([PNG], 'photo.png'), { ownerModule: 'notes' });

		const top = await listFolder(null, 'newest');
		expect(top.files.map((item) => item.name)).toEqual(['table.csv']);
		const inside = await listFolder(folder.id, 'newest');
		expect(inside.files.map((item) => [item.name, item.kind, item.inFiles])).toEqual([
			['scan.pdf', 'pdf', true]
		]);

		expect(await listSources()).toEqual([{ module: 'notes', label: 'Notes', fileCount: 1 }]);
		expect((await listSource('notes', 'newest')).map((item) => item.id)).toEqual([image.id]);

		const detail = await getFileDetail(scan);
		expect(detail?.location).toEqual({
			kind: 'folder',
			path: [{ id: folder.id, name: 'Scans' }]
		});
		expect((await getFileDetail(image.id))?.location).toMatchObject({ kind: 'source' });
	});

	it('are renamed and moved only when the Files module keeps them', async () => {
		const [kept] = await uploadToFiles(null, new File(['x'], 'old.txt'));
		const target = await createFolder({ name: 'Target', parentId: null });
		const image = await storeUpload(new File([PNG], 'photo.png'), { ownerModule: 'notes' });

		await renameFile(kept, 'new name.txt');
		await moveFiles([kept], target.id);
		expect((await getFileDetail(kept))?.name).toBe('new name.txt');
		expect((await listFolder(target.id, 'newest')).files.map((item) => item.id)).toEqual([
			kept
		]);

		await expect(renameFile(image.id, 'x.png')).rejects.toThrow(ValidationError);
		await expect(moveFiles([image.id], null)).rejects.toThrow(ValidationError);
		await expect(renameFile(kept, '')).rejects.toThrow(ValidationError);
	});

	it('name their uses and are never deleted while in use', async () => {
		const [shown] = await uploadToFiles(null, new File([PNG], 'shown.png'));
		const [loose] = await uploadToFiles(null, new File(['x'], 'loose.txt'));
		const created = await createNote(
			{
				title: 'Trip',
				content: {
					type: 'doc',
					content: [{ type: 'image', attrs: { src: `/files/${shown}` } }]
				}
			},
			OWNER
		);
		await createService(
			{ alias: 'Router', url: 'https://router.example' },
			new File([PNG], 'icon.png')
		);
		const [icon] = (await listSources()).filter((source) => source.module === 'services');
		expect(icon.fileCount).toBe(1);

		expect((await getFileDetail(shown))?.uses).toEqual([
			{
				fileId: shown,
				module: 'notes',
				label: 'Trip',
				href: `/notes/${created.id}`,
				trashed: false
			}
		]);
		await expect(deleteFile(shown)).rejects.toThrow(ValidationError);
		const [iconFile] = await listSource('services', 'newest');
		expect(iconFile.uses).toMatchObject([{ module: 'services', label: 'Router' }]);
		await expect(deleteFile(iconFile.id)).rejects.toThrow(ValidationError);

		await deleteFile(loose);
		expect(await getFileDetail(loose)).toBeNull();
		await expect(deleteFile(loose)).rejects.toThrow(NotFoundError);

		await trashNote(created.id);
		await deleteNotePermanently(created.id);
		await deleteFile(shown);
		expect(await getFileDetail(shown)).toBeNull();
	});

	it('are filtered by name, kind and use, and found by the search', async () => {
		const [report] = await uploadToFiles(
			null,
			new File(['%PDF-1.7 x'], 'Annual Report.pdf'),
			new File([PNG], 'photo.png'),
			new File([new Uint8Array([0x50, 0x4b, 3, 4])], 'archive.zip')
		);
		const names = async (filter: Parameters<typeof filterFiles>[0]) =>
			(await filterFiles(filter, 'name')).map((item) => item.name);
		expect(await names({ query: 'report', kind: 'all', unused: false })).toEqual([
			'Annual Report.pdf'
		]);
		expect(await names({ query: '', kind: 'image', unused: false })).toEqual(['photo.png']);
		expect(await names({ query: '', kind: 'other', unused: false })).toEqual(['archive.zip']);
		expect(await names({ query: '', kind: 'all', unused: true })).toHaveLength(3);

		const hits = await searchFiles('annual', 5);
		expect(hits.map((hit) => hit.id)).toEqual([report]);
		const provided = await filesServerManifest.search?.search('annual', 5);
		expect(provided?.[0]).toMatchObject({ type: 'file', href: `/files/view/${report}` });
	});

	it('kept by the Files module survive the purge of files nothing uses', async () => {
		const [kept] = await uploadToFiles(null, new File(['x'], 'kept.txt'));
		const loose = await storeUpload(new File([PNG], 'loose.png'), { ownerModule: 'api' });

		await purgeUnreferencedFiles(fileReferences(), new Date(Date.now() + 2 * DAY));
		expect(await getFileDetail(kept)).not.toBeNull();
		expect(await getFileDetail(loose.id)).toBeNull();
	});
});
