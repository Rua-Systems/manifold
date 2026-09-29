import { getDb } from '$lib/server/db';
import { file } from '$lib/server/db/schema';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { purgeUnreferencedFiles } from '$lib/server/files/files';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { servicesServerManifest } from './manifest.server';
import { service } from './schema.server';
import {
	createService,
	deleteService,
	getService,
	listServices,
	moveService,
	reorderServices,
	updateService
} from './services.server';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

function upload(bytes: Uint8Array, name: string, type = 'application/octet-stream'): File {
	return new File([new Uint8Array(bytes)], name, { type });
}

async function create(alias: string, url = `https://${alias.toLowerCase()}.example.com`) {
	return createService({ alias, url });
}

beforeEach(async () => {
	await getDb().delete(service);
});

describe('services', () => {
	it('creates, reads, updates and deletes', async () => {
		const created = await create('Grafana');
		expect(created).toMatchObject({ alias: 'Grafana', iconFileId: null, position: 0 });

		const updated = await updateService(created.id, {
			alias: 'Grafana Prod',
			url: 'https://grafana.prod.example.com'
		});
		expect(updated.alias).toBe('Grafana Prod');
		expect((await getService(created.id)).url).toBe('https://grafana.prod.example.com');

		await deleteService(created.id);
		await expect(getService(created.id)).rejects.toBeInstanceOf(NotFoundError);
	});

	it('refuses addresses that are not http or https', async () => {
		for (const url of ['javascript:alert(1)', 'data:text/html,x', 'ftp://example.com']) {
			await expect(createService({ alias: 'Bad', url })).rejects.toSatisfy(
				(error) => error instanceof ValidationError && error.fields.url !== undefined
			);
		}
		expect(await listServices()).toHaveLength(0);
	});

	it('appends new services and keeps the order they are given', async () => {
		const first = await create('First');
		const second = await create('Second');
		const third = await create('Third');
		expect((await listServices()).map((item) => item.alias)).toEqual([
			'First',
			'Second',
			'Third'
		]);

		await reorderServices([third.id, first.id, second.id]);
		expect((await listServices()).map((item) => item.alias)).toEqual([
			'Third',
			'First',
			'Second'
		]);

		await moveService(first.id, 'up');
		expect((await listServices()).map((item) => item.alias)).toEqual([
			'First',
			'Third',
			'Second'
		]);

		await moveService(first.id, 'up');
		expect((await listServices()).map((item) => item.alias)).toEqual([
			'First',
			'Third',
			'Second'
		]);
	});

	it('rejects an order that does not list every service exactly once', async () => {
		const first = await create('First');
		const second = await create('Second');

		for (const ids of [[first.id], [first.id, first.id], [first.id, second.id, 'extra']]) {
			await expect(reorderServices(ids)).rejects.toBeInstanceOf(ValidationError);
		}
	});

	it('stores an image icon found by its content and allows SVG for icons', async () => {
		const withPng = await createService(
			{ alias: 'Png', url: 'https://png.example.com' },
			upload(PNG, 'logo.bin')
		);
		const withSvg = await createService(
			{ alias: 'Svg', url: 'https://svg.example.com' },
			upload(SVG, 'logo.svg', 'image/svg+xml')
		);

		for (const [item, type] of [
			[withPng, 'image/png'],
			[withSvg, 'image/svg+xml']
		] as const) {
			expect(item.iconFileId).not.toBeNull();
			const [row] = await getDb()
				.select()
				.from(file)
				.where(eq(file.id, item.iconFileId ?? ''));
			expect(row.mimeType).toBe(type);
			expect(row.ownerModule).toBe('services');
		}
	});

	it('rejects a renamed file that is not an image', async () => {
		const script = new TextEncoder().encode('#!/bin/sh\nrm -rf /\n');

		await expect(
			createService(
				{ alias: 'Sneaky', url: 'https://sneaky.example.com' },
				upload(script, 'innocent.png', 'image/png')
			)
		).rejects.toSatisfy(
			(error) => error instanceof ValidationError && error.fields.icon !== undefined
		);
	});

	it('shows services in order in the sidebar, as external links, then Manage', async () => {
		await create('Alpha');
		await create('Beta');

		const group = await servicesServerManifest.sidebarGroup?.();
		expect(group?.items.map((item) => item.label)).toEqual(['Alpha', 'Beta', 'Manage']);
		expect(group?.items[0].link).toEqual({
			kind: 'external',
			url: 'https://alpha.example.com'
		});
		expect(group?.items[0].icon).toEqual({ kind: 'letter', letter: 'A' });
		expect(group?.items[2].link).toEqual({ kind: 'internal', path: '/services' });
	});
});

describe('unreferenced files', () => {
	it('are purged after a day, while icons in use stay', async () => {
		const kept = await createService(
			{ alias: 'Kept', url: 'https://kept.example.com' },
			upload(PNG, 'kept.png')
		);
		const dropped = await createService(
			{ alias: 'Dropped', url: 'https://dropped.example.com' },
			upload(PNG, 'dropped.png')
		);
		await updateService(
			dropped.id,
			{ alias: 'Dropped', url: dropped.url },
			{ removeIcon: true }
		);

		const references = servicesServerManifest.fileReferences ?? [];
		const tomorrow = new Date(Date.now() + 25 * 60 * 60 * 1000);

		expect(await purgeUnreferencedFiles(references, new Date())).toBe(0);
		const purged = await purgeUnreferencedFiles(references, tomorrow);
		expect(purged).toBeGreaterThanOrEqual(1);

		const [keptRow] = await getDb()
			.select({ id: file.id })
			.from(file)
			.where(eq(file.id, kept.iconFileId ?? ''));
		expect(keptRow).toBeDefined();
		const [droppedRow] = await getDb()
			.select({ id: file.id })
			.from(file)
			.where(eq(file.id, dropped.iconFileId ?? ''));
		expect(droppedRow).toBeUndefined();
	});
});
