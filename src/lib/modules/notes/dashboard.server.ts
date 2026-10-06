import { m } from '$lib/paraglide/messages.js';
import { getDb } from '$lib/server/db';
import type { DashboardCard } from '$lib/types/dashboard';
import { fillDays, startOfLastDays } from '$lib/utils/days';
import { and, count, desc, eq, gte, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import { mapFeature, note, noteRevision } from './schema.server';

const EDIT_DAYS = 30;
const RECENT_NOTES = 5;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function countNotes(where: SQL | undefined): Promise<number> {
	const [row] = await getDb().select({ value: count() }).from(note).where(where);
	return row.value;
}

/** Revisions written per day, a measure of how much the notes changed. */
async function revisionsPerDay(now: Date) {
	const day = sql<string>`to_char(${noteRevision.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`;
	const rows = await getDb()
		.select({ day, count: count() })
		.from(noteRevision)
		.where(gte(noteRevision.createdAt, startOfLastDays(EDIT_DAYS, now)))
		.groupBy(day);
	return fillDays(rows, EDIT_DAYS, now);
}

async function notesCard(now: Date): Promise<DashboardCard> {
	const [notes, editedThisWeek, trashed, edits, recent] = await Promise.all([
		countNotes(isNull(note.deletedAt)),
		countNotes(
			and(isNull(note.deletedAt), gte(note.updatedAt, new Date(now.getTime() - WEEK_MS)))
		),
		countNotes(isNotNull(note.deletedAt)),
		revisionsPerDay(now),
		getDb()
			.select({ id: note.id, title: note.title, updatedAt: note.updatedAt })
			.from(note)
			.where(isNull(note.deletedAt))
			.orderBy(desc(note.updatedAt))
			.limit(RECENT_NOTES)
	]);
	return {
		id: 'notes',
		title: m.notes_title(),
		href: '/notes',
		blocks: [
			{
				kind: 'stats',
				stats: [
					{ id: 'notes', label: m.dashboard_notes(), value: notes, unit: 'count' },
					{
						id: 'edited',
						label: m.dashboard_notes_edited(),
						value: editedThisWeek,
						unit: 'count'
					},
					{ id: 'trash', label: m.dashboard_notes_trash(), value: trashed, unit: 'count' }
				]
			},
			{ kind: 'days', id: 'edits', title: m.dashboard_notes_edits(), days: edits },
			{
				kind: 'links',
				id: 'recent',
				title: m.dashboard_notes_recent(),
				empty: m.dashboard_notes_empty(),
				links: recent.map((item) => ({
					id: item.id,
					label: item.title || m.notes_untitled(),
					href: `/notes/${item.id}`,
					external: false,
					time: item.updatedAt
				}))
			}
		]
	};
}

/** Pins, lines and polygons of notes outside the trash. */
async function mapCard(): Promise<DashboardCard> {
	const rows = await getDb()
		.select({ kind: mapFeature.kind, count: count() })
		.from(mapFeature)
		.innerJoin(note, eq(note.id, mapFeature.noteId))
		.where(isNull(note.deletedAt))
		.groupBy(mapFeature.kind);
	const byKind = new Map(rows.map((row) => [row.kind, row.count]));
	return {
		id: 'map',
		title: m.map_title(),
		href: '/notes/map',
		blocks: [
			{
				kind: 'stats',
				stats: [
					{
						id: 'point',
						label: m.dashboard_map_pins(),
						value: byKind.get('point') ?? 0,
						unit: 'count'
					},
					{
						id: 'line',
						label: m.dashboard_map_lines(),
						value: byKind.get('line') ?? 0,
						unit: 'count'
					},
					{
						id: 'polygon',
						label: m.dashboard_map_polygons(),
						value: byKind.get('polygon') ?? 0,
						unit: 'count'
					}
				]
			}
		]
	};
}

export async function notesDashboard(now = new Date()): Promise<DashboardCard[]> {
	return Promise.all([notesCard(now), mapCard()]);
}
