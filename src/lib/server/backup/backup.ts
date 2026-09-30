import { mkdir, mkdtemp, readdir, readFile, rm, stat, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Writable } from 'node:stream';
import postgres from 'postgres';
import { extract } from 'tar';
import { readMigrations, runMigrations } from '../db/migrate';
import { BackupError, dumpDatabase, restoreDatabase } from './pg-tools';
import { writeTarGz, type TarEntry } from './tar';

// Backups: one .tar.gz with a pg_dump custom format dump, the uploaded files and a manifest.
// Environment values, ENCRYPTION_KEY above all, are never part of it.

const MANIFEST = 'manifest.json';
const DUMP = 'database.dump';
const UPLOADS = 'uploads';

export interface BackupManifest {
	app: 'Manifold';
	/** The app version that wrote the backup. */
	version: string;
	/** The newest migration applied to the database, such as `0011`. */
	migration: string;
	createdAt: string;
}

export interface BackupOptions {
	databaseUrl: string;
	uploadDir: string;
	version: string;
	now?: Date;
}

/** A fresh work folder. In the container TMPDIR is a folder on the volume that may not exist yet. */
async function workFolder(prefix: string): Promise<string> {
	await mkdir(tmpdir(), { recursive: true });
	return mkdtemp(path.join(tmpdir(), prefix));
}

async function latestAppliedMigration(databaseUrl: string): Promise<string> {
	const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
	try {
		const [row] = await sql<{ version: string | null }[]>`
			select max(version) as version from schema_migrations
		`;
		return row?.version ?? '0000';
	} finally {
		await sql.end();
	}
}

async function* uploadEntries(uploadDir: string): AsyncGenerator<TarEntry> {
	let names: string[];
	try {
		names = await readdir(uploadDir);
	} catch {
		return;
	}
	for (const name of names.sort()) {
		const file = path.join(uploadDir, name);
		const info = await stat(file);
		if (info.isFile()) {
			yield {
				name: `${UPLOADS}/${name}`,
				size: info.size,
				mtime: info.mtime,
				source: { path: file }
			};
		}
	}
}

/** Writes a backup archive to `output` and answers its manifest. */
export async function writeBackup(
	output: Writable,
	options: BackupOptions
): Promise<BackupManifest> {
	const now = options.now ?? new Date();
	const work = await workFolder('manifold-backup-');
	try {
		const manifest: BackupManifest = {
			app: 'Manifold',
			version: options.version,
			migration: await latestAppliedMigration(options.databaseUrl),
			createdAt: now.toISOString()
		};
		const dumpFile = path.join(work, DUMP);
		await dumpDatabase(options.databaseUrl, dumpFile);
		const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
		const dumpInfo = await stat(dumpFile);

		async function* entries(): AsyncGenerator<TarEntry> {
			yield {
				name: MANIFEST,
				size: manifestBytes.length,
				mtime: now,
				source: { bytes: manifestBytes }
			};
			yield { name: DUMP, size: dumpInfo.size, mtime: now, source: { path: dumpFile } };
			yield* uploadEntries(options.uploadDir);
		}
		await writeTarGz(entries(), output);
		return manifest;
	} finally {
		await rm(work, { recursive: true, force: true });
	}
}

export interface RestoreOptions {
	databaseUrl: string;
	uploadDir: string;
	migrationsDir: string;
	/** Replace a database that already holds data, and the uploaded files with it. */
	force?: boolean;
}

function parseManifest(text: string): BackupManifest {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		throw new BackupError('The archive has no readable manifest.');
	}
	const manifest = value as Partial<BackupManifest>;
	if (manifest.app !== 'Manifold' || typeof manifest.migration !== 'string') {
		throw new BackupError('This is not a Manifold backup.');
	}
	return manifest as BackupManifest;
}

/** Whether the database holds any table of its own (PostGIS's reference table does not count). */
async function hasData(sql: postgres.Sql): Promise<boolean> {
	const [row] = await sql<{ total: number }[]>`
		select count(*)::int as total from information_schema.tables
		where table_schema = 'public' and table_type = 'BASE TABLE' and table_name <> 'spatial_ref_sys'
	`;
	return row.total > 0;
}

/**
 * Drops every schema of the database with everything in it, extensions included. The PostGIS
 * image puts `tiger` and `topology` next to `public`; the dump brings back whatever it holds.
 */
async function emptyDatabase(sql: postgres.Sql): Promise<void> {
	const schemas = await sql<{ name: string }[]>`
		select nspname as name from pg_namespace
		where nspname not in ('pg_catalog', 'information_schema') and nspname not like 'pg\\_%'
	`;
	for (const { name } of schemas) {
		await sql.unsafe(`drop schema "${name.replaceAll('"', '""')}" cascade`);
	}
	await sql.unsafe('create schema public');
}

/**
 * Restores an archive: the database (into an empty one, or over the current one with `force`),
 * then the uploaded files, then the migrations newer than the backup. Answers the manifest and
 * the migrations it applied.
 */
export async function restoreBackup(
	archive: string,
	options: RestoreOptions
): Promise<{ manifest: BackupManifest; applied: string[] }> {
	const work = await workFolder('manifold-restore-');
	const sql = postgres(options.databaseUrl, { max: 1, onnotice: () => {} });
	try {
		try {
			await extract({ file: archive, cwd: work, strict: true });
		} catch {
			throw new BackupError('The archive cannot be read.');
		}
		const manifest = parseManifest(await readFile(path.join(work, MANIFEST), 'utf8'));

		const known = await readMigrations(options.migrationsDir);
		const newest = known.at(-1)?.version ?? '0000';
		if (manifest.migration > newest) {
			throw new BackupError(
				`The backup comes from a newer Manifold (migration ${manifest.migration}, this one knows ${newest}). Update first.`
			);
		}

		if (await hasData(sql)) {
			if (options.force !== true) {
				throw new BackupError('The database is not empty. Use --force to replace it.');
			}
			await emptyDatabase(sql);
		}
		await restoreDatabase(options.databaseUrl, path.join(work, DUMP));

		await mkdir(options.uploadDir, { recursive: true });
		if (options.force === true) {
			// The folder itself stays: in the container it is a mounted volume.
			for (const entry of await readdir(options.uploadDir)) {
				await rm(path.join(options.uploadDir, entry), { recursive: true, force: true });
			}
		}
		const restoredUploads = path.join(work, UPLOADS);
		let names: string[] = [];
		try {
			names = await readdir(restoredUploads);
		} catch {
			// A backup without uploads.
		}
		for (const name of names) {
			await copyFile(path.join(restoredUploads, name), path.join(options.uploadDir, name));
		}

		const applied = await runMigrations(sql, options.migrationsDir);
		return { manifest, applied };
	} finally {
		await sql.end();
		await rm(work, { recursive: true, force: true });
	}
}
