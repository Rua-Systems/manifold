import { getDb } from '$lib/server/db';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { FileRejectedError, imageMaxBytes, storeUpload } from '$lib/server/files/files';
import { fileRejectionMessage } from '$lib/server/files/messages';
import { isUuid } from '$lib/utils/uuid';
import { fieldErrors } from '$lib/utils/validation';
import { m } from '$lib/paraglide/messages.js';
import { containsPattern } from '$lib/server/search-query';
import type { FileUse } from '$lib/types/files';
import { asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { service } from './schema.server';
import { serviceSchema, type ServiceInput } from './schemas';
import type { MoveDirection, Service } from './types';

export const SERVICES_MODULE = 'services';

const columns = {
	id: service.id,
	alias: service.alias,
	url: service.url,
	iconFileId: service.iconFileId,
	position: service.position
};

function parseInput(input: unknown): ServiceInput {
	const parsed = serviceSchema.safeParse(input);
	if (!parsed.success) {
		throw new ValidationError(fieldErrors(parsed.error));
	}
	return parsed.data;
}

/** Stores an icon upload; SVG is allowed because icons are only ever shown through <img>. */
async function storeIcon(icon: File): Promise<string> {
	try {
		const stored = await storeUpload(icon, { ownerModule: SERVICES_MODULE, allowSvg: true });
		return stored.id;
	} catch (error) {
		if (error instanceof FileRejectedError) {
			throw new ValidationError({
				icon: fileRejectionMessage(error.reason, {
					allowSvg: true,
					maxBytes: imageMaxBytes()
				})
			});
		}
		throw error;
	}
}

function hasFile(upload: File | null | undefined): upload is File {
	return upload !== null && upload !== undefined && upload.size > 0;
}

export async function listServices(): Promise<Service[]> {
	return getDb()
		.select(columns)
		.from(service)
		.orderBy(asc(service.position), asc(service.createdAt));
}

export async function getService(id: string): Promise<Service> {
	if (!isUuid(id)) {
		throw new NotFoundError('Service');
	}
	const [row] = await getDb().select(columns).from(service).where(eq(service.id, id)).limit(1);
	if (row === undefined) {
		throw new NotFoundError('Service');
	}
	return row;
}

export async function createService(input: unknown, icon: File | null = null): Promise<Service> {
	const data = parseInput(input);
	let iconFileId: string | null = null;
	if (hasFile(icon)) {
		iconFileId = await storeIcon(icon);
	}

	const [created] = await getDb()
		.insert(service)
		.values({
			...data,
			iconFileId,
			position: sql`(select coalesce(max(${service.position}), -1) + 1 from ${service})`
		})
		.returning(columns);
	return created;
}

export interface IconChange {
	icon?: File | null;
	removeIcon?: boolean;
}

export async function updateService(
	id: string,
	input: unknown,
	change: IconChange = {}
): Promise<Service> {
	const data = parseInput(input);
	const current = await getService(id);

	let iconFileId = current.iconFileId;
	if (hasFile(change.icon)) {
		iconFileId = await storeIcon(change.icon);
	} else if (change.removeIcon === true) {
		iconFileId = null;
	}

	const [updated] = await getDb()
		.update(service)
		.set({ ...data, iconFileId, updatedAt: new Date() })
		.where(eq(service.id, id))
		.returning(columns);
	return updated;
}

/** Deletes the service; its icon file becomes unreferenced and is purged by housekeeping. */
export async function deleteService(id: string): Promise<void> {
	if (!isUuid(id)) {
		throw new NotFoundError('Service');
	}
	const deleted = await getDb()
		.delete(service)
		.where(eq(service.id, id))
		.returning({ id: service.id });
	if (deleted.length === 0) {
		throw new NotFoundError('Service');
	}
}

async function writeOrder(ids: string[]): Promise<void> {
	await getDb().transaction(async (tx) => {
		for (const [index, id] of ids.entries()) {
			await tx
				.update(service)
				.set({ position: index, updatedAt: new Date() })
				.where(eq(service.id, id));
		}
	});
}

/** Sets the order from a complete list of service ids. */
export async function reorderServices(ids: string[]): Promise<Service[]> {
	const current = await listServices();
	const known = new Set(current.map((item) => item.id));
	const complete =
		ids.length === known.size &&
		new Set(ids).size === ids.length &&
		ids.every((id) => known.has(id));
	if (!complete) {
		throw new ValidationError({ order: m.services_error_order() });
	}

	await writeOrder(ids);
	return listServices();
}

/** Swaps a service with its neighbour; moving past either end changes nothing. */
export async function moveService(id: string, direction: MoveDirection): Promise<Service[]> {
	const ids = (await listServices()).map((item) => item.id);
	const index = ids.indexOf(id);
	if (index === -1) {
		throw new NotFoundError('Service');
	}

	let target = index + 1;
	if (direction === 'up') {
		target = index - 1;
	}
	if (target < 0 || target >= ids.length) {
		return listServices();
	}

	[ids[index], ids[target]] = [ids[target], ids[index]];
	await writeOrder(ids);
	return listServices();
}

/** Services whose alias or address contains the query or looks like it, best first. */
export async function searchServices(
	query: string,
	limit: number
): Promise<(Service & { score: number })[]> {
	const pattern = containsPattern(query);
	const score = sql<number>`greatest(
		similarity(${service.alias}, ${query}),
		word_similarity(${query}, ${service.alias}),
		similarity(${service.url}, ${query}) * 0.8,
		word_similarity(${query}, ${service.url}) * 0.8,
		case when ${service.alias} ilike ${pattern} then 0.9 else 0 end
	)::float8`;
	const rows = await getDb()
		.select({ ...columns, score })
		.from(service)
		.where(
			or(
				ilike(service.alias, pattern),
				ilike(service.url, pattern),
				sql`${service.alias} % ${query}`,
				sql`${query} <% ${service.alias}`,
				sql`${service.url} % ${query}`,
				sql`${query} <% ${service.url}`
			)
		)
		.orderBy(desc(score), asc(service.position))
		.limit(limit);
	return rows.map((row) => ({ ...row, score: Number(row.score) }));
}

/** The services that show these files as their icon, for the Files page. */
export async function serviceFileUses(fileIds: string[]): Promise<FileUse[]> {
	const rows = await getDb()
		.select({ fileId: service.iconFileId, alias: service.alias })
		.from(service)
		.where(inArray(service.iconFileId, fileIds))
		.orderBy(asc(service.position));
	return rows.flatMap((row) => {
		if (row.fileId === null) {
			return [];
		}
		return [
			{
				fileId: row.fileId,
				module: SERVICES_MODULE,
				label: row.alias,
				href: '/services',
				trashed: false
			}
		];
	});
}
