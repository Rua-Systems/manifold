import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Sql } from 'postgres';

// Arbitrary but fixed: every Manifold process asks for the same advisory lock, so only one of them
// migrates at a time.
const MIGRATION_LOCK_KEY = 7_264_519_031;

const FILE_PATTERN = /^(\d{4})_([a-z0-9]+(?:[_-][a-z0-9]+)*)\.sql$/;

export interface MigrationFile {
	version: string;
	name: string;
	fileName: string;
	checksum: string;
	sql: string;
}

interface AppliedMigration {
	version: string;
	checksum: string;
}

export class MigrationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'MigrationError';
	}
}

/** The folder the app and the CLI read migrations from: `migrations/` next to the working directory. */
export function defaultMigrationsDirectory(): string {
	return path.resolve(process.cwd(), 'migrations');
}

/** Line endings are normalized first, so a Windows checkout and the Linux image agree. */
export function checksumOf(content: string): string {
	return createHash('sha256').update(content.replaceAll('\r\n', '\n')).digest('hex');
}

export async function readMigrations(directory: string): Promise<MigrationFile[]> {
	const entries = await readdir(directory);
	const files: MigrationFile[] = [];
	const seen = new Map<string, string>();

	for (const fileName of entries.filter((entry) => entry.endsWith('.sql')).sort()) {
		const match = FILE_PATTERN.exec(fileName);
		if (match === null) {
			throw new MigrationError(
				`Migration file "${fileName}" does not match NNNN_<module-or-core>_<description>.sql.`
			);
		}

		const [, version, name] = match;
		const duplicate = seen.get(version);
		if (duplicate !== undefined) {
			throw new MigrationError(
				`Migrations "${duplicate}" and "${fileName}" share version ${version}.`
			);
		}
		seen.set(version, fileName);

		const content = await readFile(path.join(directory, fileName), 'utf8');
		files.push({ version, name, fileName, checksum: checksumOf(content), sql: content });
	}
	return files;
}

function verifyApplied(files: MigrationFile[], applied: AppliedMigration[]): void {
	const byVersion = new Map(files.map((file) => [file.version, file]));

	for (const row of applied) {
		const file = byVersion.get(row.version);
		if (file === undefined) {
			throw new MigrationError(
				`The database has migration ${row.version} applied, but this build has no such file. ` +
					'It was probably created by a newer version of Manifold.'
			);
		}
		if (file.checksum !== row.checksum) {
			throw new MigrationError(
				`Migration ${file.fileName} changed after it was applied (checksum mismatch). ` +
					'Applied migrations must never be edited; add a new migration instead.'
			);
		}
	}
}

/**
 * Applies every pending migration in order, each in its own transaction, under an advisory lock.
 * Returns the file names it applied.
 */
export async function runMigrations(sql: Sql, directory: string): Promise<string[]> {
	const files = await readMigrations(directory);
	const connection = await sql.reserve();

	try {
		await connection`select pg_advisory_lock(${MIGRATION_LOCK_KEY})`;
		try {
			await connection`
				create table if not exists schema_migrations (
					version text primary key,
					name text not null,
					checksum text not null,
					applied_at timestamptz not null default now()
				)
			`;
			const applied = await connection<AppliedMigration[]>`
				select version, checksum from schema_migrations order by version
			`;
			verifyApplied(files, applied);

			const appliedVersions = new Set(applied.map((row) => row.version));
			const done: string[] = [];

			for (const file of files.filter(
				(candidate) => !appliedVersions.has(candidate.version)
			)) {
				await connection`begin`;
				try {
					await connection.unsafe(file.sql);
					await connection`
						insert into schema_migrations (version, name, checksum)
						values (${file.version}, ${file.name}, ${file.checksum})
					`;
					await connection`commit`;
				} catch (error) {
					await connection`rollback`;
					throw new MigrationError(`Migration ${file.fileName} failed: ${String(error)}`);
				}
				done.push(file.fileName);
			}
			return done;
		} finally {
			await connection`select pg_advisory_unlock(${MIGRATION_LOCK_KEY})`;
		}
	} finally {
		connection.release();
	}
}
