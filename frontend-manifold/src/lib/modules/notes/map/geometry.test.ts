import { describe, expect, it } from 'vitest';
import { KIND_BY_TYPE, mapGeometrySchema, vertexCount } from './geometry';

describe('map geometries', () => {
	it('counts vertices of every ring', () => {
		expect(vertexCount({ type: 'Point', coordinates: [1, 2] })).toBe(1);
		expect(
			vertexCount({
				type: 'Polygon',
				coordinates: [
					[
						[0, 0],
						[4, 0],
						[4, 4],
						[0, 0]
					],
					[
						[1, 1],
						[2, 1],
						[2, 2],
						[1, 1]
					]
				]
			})
		).toBe(8);
	});

	it('maps GeoJSON types to feature kinds', () => {
		expect(KIND_BY_TYPE).toEqual({ Point: 'point', LineString: 'line', Polygon: 'polygon' });
	});

	it('keeps only the type and coordinates', () => {
		const parsed = mapGeometrySchema.parse({
			type: 'Point',
			coordinates: [1, 2],
			crs: { type: 'name' },
			bbox: [1, 2, 1, 2]
		});
		expect(parsed).toEqual({ type: 'Point', coordinates: [1, 2] });
	});

	it('refuses a line with one position and a ring with three', () => {
		expect(
			mapGeometrySchema.safeParse({ type: 'LineString', coordinates: [[0, 0]] }).success
		).toBe(false);
		expect(
			mapGeometrySchema.safeParse({
				type: 'Polygon',
				coordinates: [
					[
						[0, 0],
						[1, 0],
						[0, 0]
					]
				]
			}).success
		).toBe(false);
	});
});
