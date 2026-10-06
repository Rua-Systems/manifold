import { sql, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { readdir, stat, statfs } from 'node:fs/promises';
import path from 'node:path';
import { getDb } from '../db';

// Measurements for the usage report. Modules call measureRows for their own tables; this file
// imports no module, so the modules' manifests can use it.

export interface RowMeasure {
	count: number;
	bytes: number;
}

/**
 * How many rows of a table match, and the space their data takes as stored: the size of each
 * whole row, with compressed values counted compressed. Indexes are not included.
 */
export async function measureRows(table: PgTable, where?: SQL): Promise<RowMeasure> {
	const [row] = await getDb()
		.select({
			count: sql<number>`count(*)::int`,
			bytes: sql<number>`coalesce(sum(pg_column_size(${table}.*)), 0)::float8`
		})
		.from(table)
		.where(where);
	return row;
}

function isMissing(cause: unknown): boolean {
	return cause instanceof Error && 'code' in cause && cause.code === 'ENOENT';
}

/** The files directly in a directory, as uploads are stored; zero when it does not exist yet. */
export async function measureDirectory(
	directory: string
): Promise<{ files: number; bytes: number }> {
	let names: string[];
	try {
		const entries = await readdir(directory, { withFileTypes: true });
		names = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
	} catch (cause) {
		if (isMissing(cause)) {
			return { files: 0, bytes: 0 };
		}
		throw cause;
	}
	const sizes = await Promise.all(
		names.map(async (name) => (await stat(path.join(directory, name))).size)
	);
	return { files: sizes.length, bytes: sizes.reduce((sum, size) => sum + size, 0) };
}

/**
 * The size and free space of the file system that holds a path, or null when the platform cannot
 * tell. A directory that does not exist yet is measured through its parent.
 */
export async function diskSpace(target: string): Promise<{ total: number; free: number } | null> {
	for (const candidate of [target, path.dirname(target)]) {
		try {
			const stats = await statfs(candidate);
			return { total: stats.blocks * stats.bsize, free: stats.bavail * stats.bsize };
		} catch (cause) {
			if (!isMissing(cause)) {
				return null;
			}
		}
	}
	return null;
}
