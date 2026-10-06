import { m } from '$lib/paraglide/messages.js';
import { measureRows } from '$lib/server/usage/measure';
import type { UsageItem } from '$lib/types/usage';
import { isNotNull, isNull } from 'drizzle-orm';
import { mapBasemap, mapFeature, note, noteRevision, noteToken } from './schema.server';

/** Notes, the trash, revisions, note tokens and the map, for the usage report. */
export async function notesUsage(): Promise<UsageItem[]> {
	const [notes, trash, revisions, tokens, features, basemaps] = await Promise.all([
		measureRows(note, isNull(note.deletedAt)),
		measureRows(note, isNotNull(note.deletedAt)),
		measureRows(noteRevision),
		measureRows(noteToken),
		measureRows(mapFeature),
		measureRows(mapBasemap)
	]);
	return [
		{ id: 'notes.notes', label: m.usage_notes(), ...notes },
		{ id: 'notes.trash', label: m.usage_notes_trash(), ...trash },
		{ id: 'notes.revisions', label: m.usage_notes_revisions(), ...revisions },
		{ id: 'notes.tokens', label: m.usage_note_tokens(), ...tokens },
		{ id: 'notes.map_features', label: m.usage_map_features(), ...features },
		{ id: 'notes.basemaps', label: m.usage_basemaps(), ...basemaps }
	];
}
