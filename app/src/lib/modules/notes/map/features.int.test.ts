import { ownerActor } from '$lib/server/actor';
import { getDb } from '$lib/server/db';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	createNote,
	getNote,
	listRevisions,
	purgeTrashedNotes,
	restoreNote,
	trashNote
} from '../notes.server';
import { mapFeature, note } from '../schema.server';
import {
	addFeature,
	addFeatureWithNewNote,
	deleteFeature,
	getMapFeature,
	listMapFeatures,
	listNoteFeatures,
	updateFeatureGeometry,
	validateGeometry
} from './features.server';
import type { MapGeometry } from './geometry';

const OWNER = ownerActor('owner-1');
const DAY = 24 * 60 * 60 * 1000;

const PIN: MapGeometry = { type: 'Point', coordinates: [28.9784, 41.0082] };
const ROUTE: MapGeometry = {
	type: 'LineString',
	coordinates: [
		[28.97, 41.0],
		[28.99, 41.01]
	]
};
const SQUARE: MapGeometry = {
	type: 'Polygon',
	coordinates: [
		[
			[0, 0],
			[1, 0],
			[1, 1],
			[0, 1],
			[0, 0]
		]
	]
};

function rejectsWith(field: string) {
	return (error: unknown) =>
		error instanceof ValidationError && error.fields[field] !== undefined;
}

beforeEach(async () => {
	await getDb().delete(note);
});

describe('geometry validation', () => {
	it('accepts points, lines and polygons and derives their kind', async () => {
		expect((await validateGeometry(PIN)).kind).toBe('point');
		expect((await validateGeometry(ROUTE)).kind).toBe('line');
		expect((await validateGeometry(SQUARE)).kind).toBe('polygon');
	});

	it('refuses other geometry types', async () => {
		for (const input of [
			{ type: 'MultiPoint', coordinates: [[0, 0]] },
			{ type: 'GeometryCollection', geometries: [PIN] },
			{ type: 'Feature', geometry: PIN, properties: {} },
			'Point',
			null
		]) {
			await expect(validateGeometry(input)).rejects.toSatisfy(rejectsWith('geometry'));
		}
	});

	it('refuses shapes PostGIS finds invalid', async () => {
		const bowtie = {
			type: 'Polygon',
			coordinates: [
				[
					[0, 0],
					[1, 1],
					[1, 0],
					[0, 1],
					[0, 0]
				]
			]
		};
		const openRing = {
			type: 'Polygon',
			coordinates: [
				[
					[0, 0],
					[1, 0],
					[1, 1],
					[0, 1]
				]
			]
		};
		const zeroLength = {
			type: 'LineString',
			coordinates: [
				[5, 5],
				[5, 5]
			]
		};
		for (const input of [bowtie, openRing, zeroLength]) {
			await expect(validateGeometry(input)).rejects.toSatisfy(rejectsWith('geometry'));
		}
	});

	it('refuses coordinates outside longitude and latitude, and extra dimensions', async () => {
		for (const coordinates of [
			[181, 0],
			[0, -91],
			[0, 0, 12]
		]) {
			await expect(validateGeometry({ type: 'Point', coordinates })).rejects.toSatisfy(
				rejectsWith('geometry')
			);
		}
	});

	it('refuses more than 10,000 vertices', async () => {
		const coordinates = Array.from({ length: 10_001 }, (_, index) => [
			index / 100_000,
			index / 100_000
		]);
		await expect(validateGeometry({ type: 'LineString', coordinates })).rejects.toSatisfy(
			(error) => error instanceof ValidationError && /10000/.test(error.fields.geometry ?? '')
		);
	});

	it('keeps the database rules even for writes that skip validation', async () => {
		const created = await createNote({ title: 'Direct' }, OWNER);
		await expect(
			getDb().execute(
				sql`insert into map_feature (note_id, geometry, kind) values (${created.id}, ST_GeomFromText('POINT(1 1)', 4326), 'line')`
			)
		).rejects.toThrow();
	});
});

describe('linking geometries to notes', () => {
	it('creates an untitled note with a revision for a new geometry', async () => {
		const feature = await addFeatureWithNewNote(PIN, OWNER);
		expect(feature).toMatchObject({ kind: 'point', noteTitle: '', geometry: PIN });

		const created = await getNote(feature.noteId);
		expect(created.title).toBe('');
		expect(await listRevisions(created.id)).toHaveLength(1);
	});

	it('links further geometries to an existing note', async () => {
		const target = await createNote({ title: 'Trip' }, OWNER);
		await addFeature(target.id, ROUTE);
		await addFeature(target.id, SQUARE);

		const features = await listNoteFeatures(target.id);
		expect(features.map((item) => item.kind)).toEqual(['line', 'polygon']);
		expect(features.every((item) => item.noteTitle === 'Trip')).toBe(true);
	});

	it('refuses to link to a missing or trashed note', async () => {
		const trashed = await createNote({ title: 'Gone' }, OWNER);
		await trashNote(trashed.id);

		await expect(addFeature(trashed.id, PIN)).rejects.toBeInstanceOf(NotFoundError);
		await expect(
			addFeature('00000000-0000-4000-8000-000000000000', PIN)
		).rejects.toBeInstanceOf(NotFoundError);
	});

	it('moves vertices but keeps the kind', async () => {
		const feature = await addFeatureWithNewNote(ROUTE, OWNER);
		const moved: MapGeometry = {
			type: 'LineString',
			coordinates: [
				[28.97, 41.0],
				[29.01, 41.02]
			]
		};
		expect((await updateFeatureGeometry(feature.id, moved)).geometry).toEqual(moved);
		await expect(updateFeatureGeometry(feature.id, PIN)).rejects.toSatisfy(
			rejectsWith('geometry')
		);
	});

	it('deletes a geometry without touching its note', async () => {
		const feature = await addFeatureWithNewNote(PIN, OWNER);
		await deleteFeature(feature.id);

		await expect(getMapFeature(feature.id)).rejects.toBeInstanceOf(NotFoundError);
		expect((await getNote(feature.noteId)).id).toBe(feature.noteId);
	});
});

describe('trash', () => {
	it('hides the geometries of trashed notes and shows them again on restore', async () => {
		const kept = await addFeatureWithNewNote(PIN, OWNER);
		const hidden = await addFeatureWithNewNote(SQUARE, OWNER);

		await trashNote(hidden.noteId);
		expect((await listMapFeatures()).map((item) => item.id)).toEqual([kept.id]);
		expect(await listNoteFeatures(hidden.noteId)).toEqual([]);
		await expect(getMapFeature(hidden.id)).rejects.toBeInstanceOf(NotFoundError);

		await restoreNote(hidden.noteId);
		expect((await listMapFeatures()).map((item) => item.id).sort()).toEqual(
			[kept.id, hidden.id].sort()
		);
	});

	it('deletes the geometries of purged notes', async () => {
		const feature = await addFeatureWithNewNote(PIN, OWNER);
		const now = new Date(Date.now() + 40 * DAY);
		await trashNote(feature.noteId, new Date(now.getTime() - 31 * DAY));
		await purgeTrashedNotes(now, 30);

		const rows = await getDb().select().from(mapFeature);
		expect(rows).toHaveLength(0);
	});
});
