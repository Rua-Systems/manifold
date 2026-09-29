import { m } from '$lib/paraglide/messages.js';
import { ownerActor } from '$lib/server/actor';
import { getEnv } from '$lib/server/env';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { requireUser } from '$lib/server/guard';
import { isUuid } from '$lib/utils/uuid';
import { textValue } from '$lib/utils/validation';
import { error, fail, type RequestEvent } from '@sveltejs/kit';
import { getNote, listNoteTitles } from '../notes.server';
import { loadNoteData } from '../page.server';
import { NEW_NOTE_ID } from '../paths';
import { noteVersionSchema } from '../schemas';
import {
	addFeature,
	addFeatureWithNewNote,
	deleteFeature,
	listMapFeatures,
	mapConfig,
	updateFeatureGeometry
} from './features.server';

// Load and form actions behind /notes/map. The map code calls the actions with fetch.

async function noteSummary(id: string | null) {
	if (id === null || !isUuid(id)) {
		return null;
	}
	try {
		const found = await getNote(id);
		return { id: found.id, title: found.title };
	} catch (cause) {
		if (cause instanceof NotFoundError) {
			return null;
		}
		throw cause;
	}
}

/**
 * Everything the map shows, loaded at once. `?attach=<id>` links the next drawn geometry to that
 * note; `?note=<id>` fits the map to that note's geometries.
 */
export async function loadMapPage(url: URL) {
	const [features, notes, attachNote] = await Promise.all([
		listMapFeatures(),
		listNoteTitles(),
		noteSummary(url.searchParams.get('attach'))
	]);
	const focus = url.searchParams.get('note');
	return {
		features,
		notes,
		attachNote,
		focusNoteId: focus !== null && isUuid(focus) ? focus : null,
		map: mapConfig(),
		uploadMaxBytes: getEnv().UPLOAD_MAX_BYTES
	};
}

function parseGeometry(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		throw new ValidationError({ geometry: m.map_error_geometry_invalid() });
	}
}

/** Validation problems answer 400 with the message; a missing note or feature answers 404. */
function featureFailure(cause: unknown) {
	if (cause instanceof ValidationError) {
		return fail(400, {
			message: Object.values(cause.fields)[0] ?? m.map_error_geometry_invalid()
		});
	}
	if (cause instanceof NotFoundError) {
		return fail(404, { message: m.map_error_missing() });
	}
	throw cause;
}

export const mapActions = {
	/** The note behind a feature, for the editor in the feature panel. */
	openNote: async ({ request, locals }: RequestEvent) => {
		requireUser(locals);
		const data = await request.formData();
		const revision = noteVersionSchema.safeParse(textValue(data, 'revision'));
		try {
			return await loadNoteData(
				textValue(data, 'id'),
				textValue(data, 'revision') !== '' && revision.success ? revision.data : null
			);
		} catch (cause) {
			if (cause instanceof NotFoundError) {
				error(404);
			}
			throw cause;
		}
	},

	/** Links a drawn geometry to a note: an existing one, or a new untitled one for `new`. */
	createFeature: async ({ request, locals }: RequestEvent) => {
		const { user } = requireUser(locals);
		const data = await request.formData();
		const noteId = textValue(data, 'noteId');
		try {
			const geometry = parseGeometry(textValue(data, 'geometry'));
			const feature =
				noteId === NEW_NOTE_ID
					? await addFeatureWithNewNote(geometry, ownerActor(user.id))
					: await addFeature(noteId, geometry);
			return { feature };
		} catch (cause) {
			return featureFailure(cause);
		}
	},

	updateFeature: async ({ request, locals }: RequestEvent) => {
		requireUser(locals);
		const data = await request.formData();
		try {
			const geometry = parseGeometry(textValue(data, 'geometry'));
			return { feature: await updateFeatureGeometry(textValue(data, 'id'), geometry) };
		} catch (cause) {
			return featureFailure(cause);
		}
	},

	deleteFeature: async ({ request, locals }: RequestEvent) => {
		requireUser(locals);
		const data = await request.formData();
		try {
			await deleteFeature(textValue(data, 'id'));
			return { message: m.map_feature_deleted() };
		} catch (cause) {
			return featureFailure(cause);
		}
	}
};
