import { getDb } from '$lib/server/db';
import { getEnv } from '$lib/server/env';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { beforeEach, describe, expect, it } from 'vitest';
import { mapBasemap } from '../schema.server';
import {
	createBasemap,
	deleteBasemap,
	listBasemaps,
	mapConfig,
	moveBasemap,
	updateBasemap,
	useBasemap
} from './basemaps.server';

function basemap(name: string, attribution = '') {
	return {
		name,
		url: `https://${name.toLowerCase()}.example.com/{z}/{x}/{y}.png`,
		attribution,
		maxZoom: '18'
	};
}

beforeEach(async () => {
	await getDb().delete(mapBasemap);
});

describe('basemaps', () => {
	it('lists the standard basemap first and escapes the owner attribution', async () => {
		const topo = await createBasemap(basemap('Topo', '<b>Topo</b> & friends'));
		expect(topo).toMatchObject({ maxZoom: 18, inUse: false, position: 0 });

		const config = await mapConfig();
		expect(config.basemaps[0]).toMatchObject({ id: null, url: getEnv().MAP_TILE_URL });
		expect(config.basemaps[1]).toMatchObject({
			id: topo.id,
			name: 'Topo',
			attribution: '&lt;b&gt;Topo&lt;/b&gt; &amp; friends',
			maxZoom: 18
		});
		expect(config.basemapId).toBeNull();

		await useBasemap(topo.id);
		expect((await mapConfig()).basemapId).toBe(topo.id);
	});

	it('keeps exactly one basemap in use and leaves it when the next one is unknown', async () => {
		const first = await createBasemap(basemap('First'));
		const second = await createBasemap(basemap('Second'));

		await useBasemap(first.id);
		await useBasemap(second.id);
		expect((await listBasemaps()).map((item) => item.inUse)).toEqual([false, true]);

		await expect(useBasemap('00000000-0000-4000-8000-000000000000')).rejects.toBeInstanceOf(
			NotFoundError
		);
		await expect(useBasemap('not an id')).rejects.toBeInstanceOf(NotFoundError);
		expect((await listBasemaps()).map((item) => item.inUse)).toEqual([false, true]);

		await useBasemap(null);
		expect((await listBasemaps()).some((item) => item.inUse)).toBe(false);
	});

	it('moves, updates and deletes, and a deleted basemap in use gives way to the standard one', async () => {
		const a = await createBasemap(basemap('A'));
		const b = await createBasemap(basemap('B'));
		const c = await createBasemap(basemap('C'));

		expect((await moveBasemap(c.id, 'up')).map((item) => item.name)).toEqual(['A', 'C', 'B']);
		expect((await moveBasemap(a.id, 'up')).map((item) => item.name)).toEqual(['A', 'C', 'B']);

		const renamed = await updateBasemap(b.id, { ...basemap('B'), name: 'Bee', maxZoom: 20 });
		expect(renamed).toMatchObject({ name: 'Bee', maxZoom: 20 });
		await expect(
			updateBasemap(b.id, { ...basemap('B'), url: 'ftp://x/{z}/{x}/{y}' })
		).rejects.toBeInstanceOf(ValidationError);

		await useBasemap(c.id);
		await deleteBasemap(c.id);
		expect((await mapConfig()).basemapId).toBeNull();
		await expect(deleteBasemap(c.id)).rejects.toBeInstanceOf(NotFoundError);
	});

	it('refuses a blank or out of range maximum zoom', async () => {
		for (const maxZoom of ['', ' ', '23', '-1', '1.5', 'deep']) {
			await expect(createBasemap({ ...basemap('Z'), maxZoom })).rejects.toBeInstanceOf(
				ValidationError
			);
		}
		expect(await listBasemaps()).toEqual([]);
	});
});
