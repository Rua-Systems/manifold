import { MODULES } from '$lib/modules/registry';
import { createNote, trashNote } from '$lib/modules/notes/notes.server';
import { note } from '$lib/modules/notes/schema.server';
import { service } from '$lib/modules/services/schema.server';
import { createService } from '$lib/modules/services/services.server';
import { vaultSecret } from '$lib/modules/vault/schema.server';
import { createSecret } from '$lib/modules/vault/vault.server';
import type { UsageItem, UsageReport } from '$lib/types/usage';
import { beforeEach, describe, expect, it } from 'vitest';
import { ownerActor } from '../actor';
import { createApiKey } from '../api-keys';
import { handleApiRequest } from '../api/router';
import { getDb } from '../db';
import { file } from '../db/schema';
import { storeUpload } from '../files/files';
import { usageReport } from './report';

const OWNER = ownerActor('owner-1');
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const SECRET_VALUE = 'usage-secret-7c1d';

function item(report: UsageReport, id: string): UsageItem {
	const found = report.content.flatMap((group) => group.items).find((entry) => entry.id === id);
	if (found === undefined) {
		throw new Error(`No usage item ${id}.`);
	}
	return found;
}

beforeEach(async () => {
	await getDb().delete(note);
	await getDb().delete(service);
	await getDb().delete(vaultSecret);
	await getDb().delete(file);
});

describe('usage report', () => {
	it('counts and sizes what each module keeps, in sidebar order', async () => {
		const empty = await usageReport();
		expect(item(empty, 'notes.notes')).toMatchObject({ count: 0, bytes: 0 });

		await createNote({ title: 'Kept' }, OWNER);
		const trashed = await createNote({ title: 'Trashed' }, OWNER);
		await trashNote(trashed.id);
		await createService({ alias: 'Grafana', url: 'https://grafana.example.com' });
		await createSecret({
			name: 'Grafana admin',
			serviceUrl: '',
			description: '',
			value: SECRET_VALUE
		});

		const report = await usageReport();
		expect(report.content.map((group) => group.id)).toEqual([
			...MODULES.map((module) => module.id),
			'system'
		]);
		expect(item(report, 'notes.notes').count).toBe(1);
		expect(item(report, 'notes.notes').bytes).toBeGreaterThan(0);
		expect(item(report, 'notes.trash').count).toBe(1);
		expect(item(report, 'notes.revisions').count).toBe(2);
		expect(item(report, 'services.services').count).toBe(1);
		expect(item(report, 'vault.secrets').count).toBe(1);
		expect(item(report, 'vault.secrets').bytes).toBeGreaterThan(0);
		expect(JSON.stringify(report)).not.toContain(SECRET_VALUE);
	});

	it('sizes uploaded files by owner and on disk', async () => {
		const before = await usageReport();
		await storeUpload(new File([PNG], 'dot.png'), { ownerModule: 'notes' });
		await storeUpload(new File([PNG], 'dot.png'), { ownerModule: 'api' });

		const report = await usageReport();
		expect(report.files).toEqual(
			expect.arrayContaining([
				{ owner: 'notes', label: 'Notes', count: 1, bytes: PNG.length },
				{ owner: 'api', label: 'Uploaded through the API', count: 1, bytes: PNG.length }
			])
		);
		expect(report.storage.uploadFiles).toBe(before.storage.uploadFiles + 2);
		expect(report.storage.uploadBytes).toBe(before.storage.uploadBytes + 2 * PNG.length);
	});

	it('lists the database tables, largest first, and the process', async () => {
		const report = await usageReport();
		expect(report.database.bytes).toBeGreaterThan(0);
		const names = report.database.tables.map((table) => table.name);
		expect(names).toEqual(expect.arrayContaining(['note', 'service', 'vault_secret', 'file']));
		const sizes = report.database.tables.map((table) => table.bytes);
		expect(sizes).toEqual([...sizes].sort((first, second) => second - first));

		expect(report.process.nodeVersion).toBe(process.version);
		expect(report.process.rssBytes).toBeGreaterThan(0);
		expect(report.process.startedAt.getTime()).toBeLessThanOrEqual(report.measuredAt.getTime());
	});
});

describe('API', () => {
	async function get(scopes: string[]): Promise<Response> {
		const { key } = await createApiKey({ name: 'Usage', scopes, expiresAt: null });
		return handleApiRequest(
			new Request('http://localhost/api/v1/usage', {
				headers: { authorization: `Bearer ${key}` }
			}),
			{ origin: { ip: null, userAgent: null } }
		);
	}

	it('answers the report to a key with usage:read only', async () => {
		await createSecret({ name: 'Mail', serviceUrl: '', description: '', value: SECRET_VALUE });

		const response = await get(['usage:read']);
		expect(response.status).toBe(200);
		const text = await response.text();
		expect(text).not.toContain(SECRET_VALUE);
		expect(JSON.parse(text)).toMatchObject({
			measured_at: expect.any(String),
			content: expect.arrayContaining([
				expect.objectContaining({
					id: 'vault',
					items: [
						{
							id: 'vault.secrets',
							label: 'Vault entries',
							count: 1,
							bytes: expect.any(Number)
						}
					]
				})
			]),
			storage: { upload_files: expect.any(Number), upload_bytes: expect.any(Number) },
			process: { node_version: process.version, uptime_seconds: expect.any(Number) }
		});

		expect((await get(['notes:read', 'vault:read'])).status).toBe(403);
	});
});
