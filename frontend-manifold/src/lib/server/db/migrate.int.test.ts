import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { withIsolatedSchema } from '../../../../tests/integration/isolated-schema';
import { connect } from './index';
import { checksumOf, MigrationError, readMigrations, runMigrations } from './migrate';

let directory: string;

async function writeMigration(fileName: string, sql: string): Promise<void> {
	await writeFile(path.join(directory, fileName), sql);
}

beforeEach(async () => {
	directory = await mkdtemp(path.join(tmpdir(), 'manifold-migrations-'));
});

afterEach(async () => {
	await rm(directory, { recursive: true, force: true });
});

describe('runMigrations', () => {
	it('applies pending files in version order and records them', async () => {
		await writeMigration(
			'0002_core_second.sql',
			'create table second (first_id int references first (id));'
		);
		await writeMigration('0001_core_first.sql', 'create table first (id int primary key);');

		await withIsolatedSchema(async ({ sql }) => {
			const applied = await runMigrations(sql, directory);
			expect(applied).toEqual(['0001_core_first.sql', '0002_core_second.sql']);

			const rows = await sql<{ version: string; name: string; checksum: string }[]>`
				select version, name, checksum from schema_migrations order by version
			`;
			expect(rows.map((row) => [row.version, row.name])).toEqual([
				['0001', 'core_first'],
				['0002', 'core_second']
			]);
			expect(rows[0].checksum).toBe(checksumOf('create table first (id int primary key);'));
		});
	});

	it('does nothing on a second run', async () => {
		await writeMigration('0001_core_first.sql', 'create table first (id int primary key);');

		await withIsolatedSchema(async ({ sql }) => {
			await runMigrations(sql, directory);
			expect(await runMigrations(sql, directory)).toEqual([]);
		});
	});

	it('stops when an applied file has changed', async () => {
		await writeMigration('0001_core_first.sql', 'create table first (id int primary key);');

		await withIsolatedSchema(async ({ sql }) => {
			await runMigrations(sql, directory);
			await writeMigration(
				'0001_core_first.sql',
				'create table first (id bigint primary key);'
			);

			await expect(runMigrations(sql, directory)).rejects.toThrow(
				/changed after it was applied/
			);
		});
	});

	it('treats a file checked out with CRLF line endings as unchanged', async () => {
		await writeMigration('0001_core_first.sql', 'create table first (id int primary key);\n');

		await withIsolatedSchema(async ({ sql }) => {
			await runMigrations(sql, directory);
			await writeMigration(
				'0001_core_first.sql',
				'create table first (id int primary key);\r\n'
			);

			expect(await runMigrations(sql, directory)).toEqual([]);
		});
	});

	it('stops when the database knows a migration this build does not', async () => {
		await writeMigration('0001_core_first.sql', 'create table first (id int primary key);');
		await writeMigration('0002_core_second.sql', 'create table second (id int primary key);');

		await withIsolatedSchema(async ({ sql }) => {
			await runMigrations(sql, directory);
			await rm(path.join(directory, '0002_core_second.sql'));

			await expect(runMigrations(sql, directory)).rejects.toThrow(/no such file/);
		});
	});

	it('rolls back a failing migration and keeps the earlier ones', async () => {
		await writeMigration('0001_core_first.sql', 'create table first (id int primary key);');
		await writeMigration(
			'0002_core_broken.sql',
			'create table broken (id int primary key); select * from missing_table;'
		);

		await withIsolatedSchema(async ({ sql }) => {
			await expect(runMigrations(sql, directory)).rejects.toBeInstanceOf(MigrationError);

			const versions = await sql<
				{ version: string }[]
			>`select version from schema_migrations`;
			expect(versions.map((row) => row.version)).toEqual(['0001']);
			const [broken] = await sql<{ exists: boolean }[]>`
				select to_regclass('broken') is not null as exists
			`;
			expect(broken.exists).toBe(false);
		});
	});

	it('runs each migration once when two processes start together', async () => {
		await writeMigration(
			'0001_core_slow.sql',
			'select pg_sleep(0.4); create table counter (id int primary key); insert into counter values (1);'
		);

		await withIsolatedSchema(async ({ sql }, { url, searchPath }) => {
			const other = connect(url, { searchPath, max: 2 });
			try {
				const results = await Promise.all([
					runMigrations(sql, directory),
					runMigrations(other.sql, directory)
				]);

				expect(results.flat()).toEqual(['0001_core_slow.sql']);
				const [{ total }] = await sql<
					{ total: number }[]
				>`select count(*)::int as total from counter`;
				expect(total).toBe(1);
			} finally {
				await other.sql.end();
			}
		});
	});
});

describe('readMigrations', () => {
	it('rejects files that do not follow the naming scheme', async () => {
		await writeMigration('1_first.sql', 'select 1;');

		await expect(readMigrations(directory)).rejects.toThrow(/does not match/);
	});

	it('rejects two files with the same version', async () => {
		await writeMigration('0001_core_first.sql', 'select 1;');
		await writeMigration('0001_notes_other.sql', 'select 1;');

		await expect(readMigrations(directory)).rejects.toThrow(/share version 0001/);
	});
});
