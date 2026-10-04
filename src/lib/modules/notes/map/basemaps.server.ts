import { getDb } from '$lib/server/db';
import { getEnv } from '$lib/server/env';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { escapeHtml } from '$lib/server/services/mail/html';
import { isUuid } from '$lib/utils/uuid';
import { fieldErrors } from '$lib/utils/validation';
import { asc, eq, sql } from 'drizzle-orm';
import { mapBasemap } from '../schema.server';
import {
	BASEMAP_DEFAULT_MAX_ZOOM,
	basemapSchema,
	type Basemap,
	type BasemapInput
} from './basemaps';
import type { MapBasemap, MapConfig } from './config';

// The owner's basemaps. The instance's own tile source from MAP_TILE_URL is configuration; it is
// listed first and shown whenever no basemap is in use.

export type MoveDirection = 'up' | 'down';

const columns = {
	id: mapBasemap.id,
	name: mapBasemap.name,
	url: mapBasemap.url,
	attribution: mapBasemap.attribution,
	maxZoom: mapBasemap.maxZoom,
	inUse: mapBasemap.inUse,
	position: mapBasemap.position
};

function parseInput(input: unknown): BasemapInput {
	const parsed = basemapSchema.safeParse(input);
	if (!parsed.success) {
		throw new ValidationError(fieldErrors(parsed.error));
	}
	return parsed.data;
}

export async function listBasemaps(): Promise<Basemap[]> {
	return getDb()
		.select(columns)
		.from(mapBasemap)
		.orderBy(asc(mapBasemap.position), asc(mapBasemap.createdAt));
}

export async function getBasemap(id: string): Promise<Basemap> {
	if (!isUuid(id)) {
		throw new NotFoundError('Basemap');
	}
	const [row] = await getDb()
		.select(columns)
		.from(mapBasemap)
		.where(eq(mapBasemap.id, id))
		.limit(1);
	if (row === undefined) {
		throw new NotFoundError('Basemap');
	}
	return row;
}

/** Adds a basemap at the end of the list. It is not put in use. */
export async function createBasemap(input: unknown): Promise<Basemap> {
	const data = parseInput(input);
	const [created] = await getDb()
		.insert(mapBasemap)
		.values({
			...data,
			position: sql`(select coalesce(max(${mapBasemap.position}), -1) + 1 from ${mapBasemap})`
		})
		.returning(columns);
	return created;
}

export async function updateBasemap(id: string, input: unknown): Promise<Basemap> {
	const data = parseInput(input);
	await getBasemap(id);
	const [updated] = await getDb()
		.update(mapBasemap)
		.set({ ...data, updatedAt: new Date() })
		.where(eq(mapBasemap.id, id))
		.returning(columns);
	return updated;
}

/** Deletes the basemap; when it was in use, the map goes back to the instance's own. */
export async function deleteBasemap(id: string): Promise<void> {
	if (!isUuid(id)) {
		throw new NotFoundError('Basemap');
	}
	const deleted = await getDb()
		.delete(mapBasemap)
		.where(eq(mapBasemap.id, id))
		.returning({ id: mapBasemap.id });
	if (deleted.length === 0) {
		throw new NotFoundError('Basemap');
	}
}

/** Swaps a basemap with its neighbour; moving past either end changes nothing. */
export async function moveBasemap(id: string, direction: MoveDirection): Promise<Basemap[]> {
	const ids = (await listBasemaps()).map((item) => item.id);
	const index = ids.indexOf(id);
	if (index === -1) {
		throw new NotFoundError('Basemap');
	}

	let target = index + 1;
	if (direction === 'up') {
		target = index - 1;
	}
	if (target < 0 || target >= ids.length) {
		return listBasemaps();
	}

	[ids[index], ids[target]] = [ids[target], ids[index]];
	await getDb().transaction(async (tx) => {
		for (const [position, current] of ids.entries()) {
			await tx
				.update(mapBasemap)
				.set({ position, updatedAt: new Date() })
				.where(eq(mapBasemap.id, current));
		}
	});
	return listBasemaps();
}

/** Puts a basemap in use, or the instance's own for null. One transaction, so one is in use. */
export async function useBasemap(id: string | null): Promise<void> {
	if (id !== null && !isUuid(id)) {
		throw new NotFoundError('Basemap');
	}
	await getDb().transaction(async (tx) => {
		await tx
			.update(mapBasemap)
			.set({ inUse: false, updatedAt: new Date() })
			.where(eq(mapBasemap.inUse, true));
		if (id === null) {
			return;
		}
		const chosen = await tx
			.update(mapBasemap)
			.set({ inUse: true, updatedAt: new Date() })
			.where(eq(mapBasemap.id, id))
			.returning({ id: mapBasemap.id });
		if (chosen.length === 0) {
			throw new NotFoundError('Basemap');
		}
	});
}

/** The instance's own basemap, from the configuration. Its attribution is trusted HTML. */
export function instanceBasemap(): MapBasemap {
	const env = getEnv();
	return {
		id: null,
		name: '',
		url: env.MAP_TILE_URL,
		attribution: env.MAP_TILE_ATTRIBUTION,
		maxZoom: BASEMAP_DEFAULT_MAX_ZOOM
	};
}

/** What the map pages need: every basemap, the one in use and the start view. */
export async function mapConfig(): Promise<MapConfig> {
	const env = getEnv();
	const owned = await listBasemaps();
	return {
		basemaps: [
			instanceBasemap(),
			...owned.map((basemap): MapBasemap => ({
				id: basemap.id,
				name: basemap.name,
				url: basemap.url,
				// The owner's attribution is text; OpenLayers shows attributions as HTML.
				attribution: escapeHtml(basemap.attribution),
				maxZoom: basemap.maxZoom
			}))
		],
		basemapId: owned.find((basemap) => basemap.inUse)?.id ?? null,
		center: env.MAP_DEFAULT_CENTER,
		zoom: env.MAP_DEFAULT_ZOOM
	};
}
