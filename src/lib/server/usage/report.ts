import { version } from '$app/environment';
import { MODULES } from '$lib/modules/registry';
import { moduleUsage } from '$lib/modules/registry.server';
import { m } from '$lib/paraglide/messages.js';
import type {
	DatabaseUsage,
	FileUsage,
	ProcessUsage,
	StorageUsage,
	UsageGroup,
	UsageReport
} from '$lib/types/usage';
import { sql } from 'drizzle-orm';
import { getDb } from '../db';
import { apiKey, auditEvent, file, session } from '../db/schema';
import { API_FILE_OWNER } from '../files/files';
import { uploadDirectory } from '../files/storage';
import { diskSpace, measureDirectory, measureRows } from './measure';

// The usage report under Settings, Usage and GET /api/v1/usage: what each module keeps, the
// uploaded files, the database, the upload directory and the running process.

export const SYSTEM_USAGE_GROUP = 'system';

/** The modules' records in sidebar order, then the system's own. */
async function contentUsage(): Promise<UsageGroup[]> {
	const [byModule, audit, keys, sessions] = await Promise.all([
		moduleUsage(),
		measureRows(auditEvent),
		measureRows(apiKey),
		measureRows(session)
	]);
	const groups: UsageGroup[] = [];
	for (const module of MODULES) {
		const items = byModule.get(module.id);
		if (items !== undefined) {
			groups.push({ id: module.id, label: module.label(), items });
		}
	}
	groups.push({
		id: SYSTEM_USAGE_GROUP,
		label: m.usage_group_system(),
		items: [
			{ id: 'system.audit_events', label: m.usage_audit_events(), ...audit },
			{ id: 'system.api_keys', label: m.usage_api_keys(), ...keys },
			{ id: 'system.sessions', label: m.usage_sessions(), ...sessions }
		]
	});
	return groups;
}

function ownerLabel(owner: string): string {
	if (owner === API_FILE_OWNER) {
		return m.usage_files_api();
	}
	const module = MODULES.find((item) => item.id === owner);
	if (module === undefined) {
		return owner;
	}
	return module.label();
}

/** Uploaded files by the module that owns them, largest first. */
async function fileUsage(): Promise<FileUsage[]> {
	const rows = await getDb()
		.select({
			owner: file.ownerModule,
			count: sql<number>`count(*)::int`,
			bytes: sql<number>`coalesce(sum(${file.sizeBytes}), 0)::float8`
		})
		.from(file)
		.groupBy(file.ownerModule);
	return rows
		.map((row) => ({ ...row, label: ownerLabel(row.owner) }))
		.sort(
			(first, second) => second.bytes - first.bytes || first.owner.localeCompare(second.owner)
		);
}

/** The whole database, and every table of the app's schema with its indexes, largest first. */
async function databaseUsage(): Promise<DatabaseUsage> {
	const [size] = await getDb().execute<{ bytes: number }>(
		sql`select pg_database_size(current_database())::float8 as bytes`
	);
	const tables = await getDb().execute<{ name: string; rows: number; bytes: number }>(sql`
		select relname as name,
			n_live_tup::float8 as rows,
			pg_total_relation_size(relid)::float8 as bytes
		from pg_stat_user_tables
		where schemaname = current_schema()
		order by bytes desc, relname
	`);
	return {
		bytes: size.bytes,
		tables: tables.map((table) => ({ name: table.name, rows: table.rows, bytes: table.bytes }))
	};
}

async function storageUsage(): Promise<StorageUsage> {
	const directory = uploadDirectory();
	const [uploads, disk] = await Promise.all([measureDirectory(directory), diskSpace(directory)]);
	return {
		uploadFiles: uploads.files,
		uploadBytes: uploads.bytes,
		diskBytes: disk?.total ?? null,
		diskFreeBytes: disk?.free ?? null
	};
}

function processUsage(now: Date): ProcessUsage {
	const memory = process.memoryUsage();
	const cpu = process.cpuUsage();
	const uptimeSeconds = Math.round(process.uptime());
	return {
		version,
		nodeVersion: process.version,
		startedAt: new Date(now.getTime() - uptimeSeconds * 1000),
		uptimeSeconds,
		rssBytes: memory.rss,
		heapUsedBytes: memory.heapUsed,
		heapTotalBytes: memory.heapTotal,
		cpuSeconds: Math.round((cpu.user + cpu.system) / 1000) / 1000
	};
}

/** The few numbers the dashboard shows, without sizing every table and record. */
export async function usageSummary(): Promise<{
	databaseBytes: number;
	uploadBytes: number;
	diskFreeBytes: number | null;
	rssBytes: number;
}> {
	const directory = uploadDirectory();
	const [[size], uploads, disk] = await Promise.all([
		getDb().execute<{ bytes: number }>(
			sql`select pg_database_size(current_database())::float8 as bytes`
		),
		measureDirectory(directory),
		diskSpace(directory)
	]);
	return {
		databaseBytes: size.bytes,
		uploadBytes: uploads.bytes,
		diskFreeBytes: disk?.free ?? null,
		rssBytes: process.memoryUsage().rss
	};
}

/** Measures everything at once; nothing is cached, so the report is always current. */
export async function usageReport(now = new Date()): Promise<UsageReport> {
	const [content, files, database, storage] = await Promise.all([
		contentUsage(),
		fileUsage(),
		databaseUsage(),
		storageUsage()
	]);
	return { measuredAt: now, content, files, database, storage, process: processUsage(now) };
}
