import { createNote } from '$lib/modules/notes/notes.server';
import { note } from '$lib/modules/notes/schema.server';
import { parseVaultKey, unseal } from '$lib/modules/vault/crypto.server';
import { vaultSecret } from '$lib/modules/vault/schema.server';
import { createSecret } from '$lib/modules/vault/vault.server';
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import postgres from 'postgres';
import { create, extract } from 'tar';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { ownerActor } from '../actor';
import { getDb, getSql } from '../db';
import { defaultMigrationsDirectory } from '../db/migrate';
import { getEnv } from '../env';
import { storeUpload } from '../files/files';
import { receiveUploads } from '../files/upload-stream';
import { uploadDirectory } from '../files/storage';
import { restoreBackup, writeBackup } from './backup';
import { BackupError } from './pg-tools';

// A backup of manifold_test restored into a fresh database of its own.

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const PDF = new TextEncoder().encode('%PDF-1.7 backed up');

const work = { dir: '', archive: '', database: '', url: '' };

function databaseUrl(name: string): string {
	const url = new URL(inject('databaseUrl'));
	url.pathname = `/${name}`;
	return url.toString();
}

async function admin<T>(task: (sql: postgres.Sql) => Promise<T>): Promise<T> {
	const sql = postgres(databaseUrl('postgres'), { max: 1, onnotice: () => {} });
	try {
		return await task(sql);
	} finally {
		await sql.end();
	}
}

async function write(archive: string): Promise<void> {
	await writeBackup(createWriteStream(archive), {
		databaseUrl: inject('databaseUrl'),
		uploadDir: uploadDirectory(),
		version: '9.9.9'
	});
}

beforeAll(async () => {
	work.dir = await mkdtemp(path.join(tmpdir(), 'manifold-backup-test-'));
	work.archive = path.join(work.dir, 'backup.tar.gz');
	work.database = `manifold_restore_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
	work.url = databaseUrl(work.database);
	await admin((sql) => sql.unsafe(`create database "${work.database}"`));
	// Like the tiger and topology schemas of the PostGIS image: a schema besides public.
	await getSql().unsafe(
		'create schema if not exists backup_extra; create table if not exists backup_extra.marker (id int)'
	);
});

afterAll(async () => {
	await getSql().unsafe('drop schema if exists backup_extra cascade');
	await admin((sql) => sql.unsafe(`drop database if exists "${work.database}" with (force)`));
	await rm(work.dir, { recursive: true, force: true });
});

describe('backup and restore', () => {
	it('carries the database, the files and readable vault values', async () => {
		const stored = await storeUpload(new File([new Uint8Array(PNG)], 'dot.png'), {
			ownerModule: 'notes'
		});
		const form = new FormData();
		form.set('file', new File([PDF], 'scan.pdf'));
		const [document] = (
			await receiveUploads(
				new Request('http://localhost/upload', { method: 'POST', body: form }),
				{ ownerModule: 'api', maxBytes: 1024, maxFiles: 1, accept: 'any' }
			)
		).files;
		const created = await createNote(
			{
				title: 'Backed up',
				content: {
					type: 'doc',
					content: [{ type: 'image', attrs: { src: `/files/${stored.id}` } }]
				}
			},
			ownerActor('owner-1')
		);
		const secret = await createSecret({
			name: 'Backed up secret',
			serviceUrl: '',
			description: '',
			value: 'still secret after restore'
		});

		await write(work.archive);
		const restoredUploads = path.join(work.dir, 'uploads');
		const { manifest } = await restoreBackup(work.archive, {
			databaseUrl: work.url,
			uploadDir: restoredUploads,
			migrationsDir: defaultMigrationsDirectory()
		});
		expect(manifest).toMatchObject({ app: 'Manifold', version: '9.9.9' });
		expect(manifest.migration).toMatch(/^\d{4}$/);

		const restored = postgres(work.url, { max: 1, onnotice: () => {} });
		try {
			const [row] = await restored<
				{ title: string }[]
			>`select title from note where id = ${created.id}`;
			expect(row.title).toBe('Backed up');
			const [sealed] = await restored<{ ciphertext: Buffer; iv: Buffer; auth_tag: Buffer }[]>`
				select ciphertext, iv, auth_tag from vault_secret where id = ${secret.id}
			`;
			const value = unseal(
				{ ciphertext: sealed.ciphertext, iv: sealed.iv, authTag: sealed.auth_tag },
				secret.id,
				parseVaultKey(getEnv().ENCRYPTION_KEY)
			);
			expect(value).toBe('still secret after restore');
			const [{ total }] = await restored<{ total: number }[]>`
				select count(*)::int as total from schema_migrations
			`;
			expect(total).toBeGreaterThan(0);
		} finally {
			await restored.end();
		}

		const bytes = await readFile(path.join(restoredUploads, stored.storageKey));
		expect(new Uint8Array(bytes)).toEqual(PNG);
		// Any type comes back, as long as a file record names it.
		const pdf = await readFile(path.join(restoredUploads, document.storageKey));
		expect(new Uint8Array(pdf)).toEqual(PDF);

		// Clean up the shared test database.
		await getDb().delete(note);
		await getDb().delete(vaultSecret);
	});

	it('refuses a database with data unless forced', async () => {
		const options = {
			databaseUrl: work.url,
			uploadDir: path.join(work.dir, 'uploads'),
			migrationsDir: defaultMigrationsDirectory()
		};
		await expect(restoreBackup(work.archive, options)).rejects.toThrow(
			'The database is not empty. Use --force to replace it.'
		);
		const restored = postgres(work.url, { max: 1, onnotice: () => {} });
		try {
			await restored.unsafe('create table leftover (id int)');
			await writeFile(path.join(options.uploadDir, 'stray-file'), 'left behind');
			const { applied } = await restoreBackup(work.archive, { ...options, force: true });
			expect(applied).toEqual([]);
			const tables = await restored<{ name: string }[]>`
				select table_schema || '.' || table_name as name from information_schema.tables
				where table_name in ('leftover', 'marker')
			`;
			expect(tables.map((row) => row.name)).toEqual(['backup_extra.marker']);
			const files = await readdir(options.uploadDir);
			expect(files).not.toContain('stray-file');
			expect(files.length).toBeGreaterThan(0);
		} finally {
			await restored.end();
		}
	});

	it('refuses archives from a newer schema and archives that are not backups', async () => {
		const staged = path.join(work.dir, 'staged');
		await rm(staged, { recursive: true, force: true });
		await mkdir(staged);
		await writeFile(
			path.join(staged, 'manifest.json'),
			JSON.stringify({ app: 'Manifold', version: '99.0.0', migration: '9999', createdAt: '' })
		);
		const newer = path.join(work.dir, 'newer.tar.gz');
		await create({ gzip: true, file: newer, cwd: staged }, ['manifest.json']);
		await expect(
			restoreBackup(newer, {
				databaseUrl: work.url,
				uploadDir: path.join(work.dir, 'uploads'),
				migrationsDir: defaultMigrationsDirectory()
			})
		).rejects.toBeInstanceOf(BackupError);

		const garbage = path.join(work.dir, 'garbage.tar.gz');
		await writeFile(garbage, 'not an archive');
		await expect(
			restoreBackup(garbage, {
				databaseUrl: work.url,
				uploadDir: path.join(work.dir, 'uploads'),
				migrationsDir: defaultMigrationsDirectory()
			})
		).rejects.toBeInstanceOf(BackupError);
	});

	it('refuses archives with foreign entries and leaves out uploads that no record names', async () => {
		const staged = path.join(work.dir, 'foreign');
		await rm(staged, { recursive: true, force: true });
		await mkdir(path.join(staged, 'uploads'), { recursive: true });
		await writeFile(
			path.join(staged, 'manifest.json'),
			JSON.stringify({ app: 'Manifold', version: '9.9.9', migration: '0001', createdAt: '' })
		);
		await writeFile(path.join(staged, 'run.sh'), 'echo hi');
		const foreign = path.join(work.dir, 'foreign.tar.gz');
		await create({ gzip: true, file: foreign, cwd: staged }, ['manifest.json', 'run.sh']);
		await expect(
			restoreBackup(foreign, {
				databaseUrl: work.url,
				uploadDir: path.join(work.dir, 'uploads'),
				migrationsDir: defaultMigrationsDirectory(),
				force: true
			})
		).rejects.toThrow('The archive holds entries that are not part of a Manifold backup.');

		const unpacked = path.join(work.dir, 'unpacked');
		await rm(unpacked, { recursive: true, force: true });
		await mkdir(unpacked);
		await extract({ file: work.archive, cwd: unpacked });
		await mkdir(path.join(unpacked, 'uploads'), { recursive: true });
		await writeFile(path.join(unpacked, 'uploads', 'not-an-image'), '#!/bin/sh');
		const edited = path.join(work.dir, 'edited.tar.gz');
		await create({ gzip: true, file: edited, cwd: unpacked }, [
			'manifest.json',
			'database.dump',
			...(await readdir(path.join(unpacked, 'uploads'))).map((name) => `uploads/${name}`)
		]);
		const uploadDir = path.join(work.dir, 'edited-uploads');
		const { skipped } = await restoreBackup(edited, {
			databaseUrl: work.url,
			uploadDir,
			migrationsDir: defaultMigrationsDirectory(),
			force: true
		});
		expect(skipped).toContain('not-an-image');
		expect(await readdir(uploadDir)).not.toContain('not-an-image');
	});

	it('never puts environment values into the archive', async () => {
		const text = (await readFile(work.archive)).toString('latin1');
		const plain = gunzipSync(await readFile(work.archive)).toString('latin1');
		for (const value of [getEnv().ENCRYPTION_KEY, getEnv().BETTER_AUTH_SECRET]) {
			expect(text).not.toContain(value);
			expect(plain).not.toContain(value);
		}
	});
});
