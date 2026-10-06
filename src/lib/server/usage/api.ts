import type { UsageReport } from '$lib/types/usage';
import { z } from 'zod';
import { defineRoute, type ApiRoute } from '../api/types';
import { usageReport } from './report';

// GET /api/v1/usage: the report of Settings, Usage. Sizes are bytes, times ISO 8601.

const measured = {
	count: z.number().int(),
	bytes: z.number().meta({ description: 'The stored size in bytes, without indexes.' })
};

const usageResource = z.object({
	measured_at: z.string(),
	content: z
		.array(
			z.object({
				id: z.string().meta({ description: 'A module id, or `system`.' }),
				label: z.string(),
				items: z.array(z.object({ id: z.string(), label: z.string(), ...measured }))
			})
		)
		.meta({ description: 'The records each module keeps, then those of the system.' }),
	files: z
		.array(
			z.object({
				owner: z.string().meta({
					description:
						'The module that owns the files, or `api` for uploads nothing uses yet.'
				}),
				label: z.string(),
				count: z.number().int(),
				bytes: z.number()
			})
		)
		.meta({ description: 'Uploaded files by owner, largest first.' }),
	database: z.object({
		bytes: z.number(),
		tables: z.array(z.object({ name: z.string(), rows: z.number(), bytes: z.number() })).meta({
			description:
				'Tables with their indexes, largest first; rows as the statistics count them.'
		})
	}),
	storage: z.object({
		upload_files: z.number().int(),
		upload_bytes: z.number(),
		disk_bytes: z.number().nullable(),
		disk_free_bytes: z.number().nullable()
	}),
	process: z.object({
		version: z.string(),
		node_version: z.string(),
		started_at: z.string(),
		uptime_seconds: z.number().int(),
		rss_bytes: z.number(),
		heap_used_bytes: z.number(),
		heap_total_bytes: z.number(),
		cpu_seconds: z.number()
	})
});

export function toUsageResource(report: UsageReport): z.output<typeof usageResource> {
	return {
		measured_at: report.measuredAt.toISOString(),
		content: report.content,
		files: report.files,
		database: report.database,
		storage: {
			upload_files: report.storage.uploadFiles,
			upload_bytes: report.storage.uploadBytes,
			disk_bytes: report.storage.diskBytes,
			disk_free_bytes: report.storage.diskFreeBytes
		},
		process: {
			version: report.process.version,
			node_version: report.process.nodeVersion,
			started_at: report.process.startedAt.toISOString(),
			uptime_seconds: report.process.uptimeSeconds,
			rss_bytes: report.process.rssBytes,
			heap_used_bytes: report.process.heapUsedBytes,
			heap_total_bytes: report.process.heapTotalBytes,
			cpu_seconds: report.process.cpuSeconds
		}
	};
}

export const usageApiRoutes: ApiRoute[] = [
	defineRoute({
		method: 'GET',
		path: '/usage',
		scope: 'usage:read',
		tag: 'usage',
		summary: 'Report what the app keeps and the resources it uses',
		description:
			'How many records each module keeps and their size, uploaded files by owner, the database and its tables, the upload directory and its disk, and the server process. Measured on every request.',
		response: { status: 200, description: 'The report.', schema: usageResource },
		handler: async () => ({ body: toUsageResource(await usageReport()) })
	})
];
