import { m } from '$lib/paraglide/messages.js';
import { localizeHref } from '$lib/paraglide/runtime.js';
import { ownerActor } from '$lib/server/actor';
import { getEnv } from '$lib/server/env';
import { ConflictError, NotFoundError, ValidationError } from '$lib/server/errors';
import { FileRejectedError, storeUpload } from '$lib/server/files/files';
import { fileRejectionMessage } from '$lib/server/files/messages';
import { requireUser } from '$lib/server/guard';
import { textValue } from '$lib/utils/validation';
import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import {
	createNote,
	deleteNotePermanently,
	getNote,
	getRevision,
	listNotes,
	listRevisions,
	NOTES_MODULE,
	restoreNote,
	restoreRevision,
	searchNotes,
	trashNote,
	updateNote
} from './notes.server';
import { mapConfig } from './map/basemaps.server';
import { listNoteFeatures } from './map/features.server';
import { NEW_NOTE_ID } from './paths';
import { noteVersionSchema } from './schemas';
import { createNoteTokenAction } from './tokens.page.server';
import { listNoteTokens } from './tokens.server';
import type { NotePreview, NoteSummary } from './types';
import { isUploadLimited } from '$lib/server/rate-limit';

/** The notes page shows at most this many search hits. */
const SEARCH_PAGE_LIMIT = 100;

// Loads and form actions behind /notes. The route files only re-export these.

/** The editor's JSON from a form field; empty keeps the current content. */
export function parseContent(raw: string): unknown {
	if (raw.length === 0) {
		return undefined;
	}
	try {
		return JSON.parse(raw);
	} catch {
		throw new ValidationError({ content: m.notes_error_content() });
	}
}

/** The answer to a failed save: a conflict, field errors or a missing note. */
export function writeFailure(cause: unknown) {
	if (cause instanceof ConflictError) {
		return fail(409, { conflict: true, currentVersion: cause.currentVersion, errors: {} });
	}
	if (cause instanceof ValidationError) {
		return fail(400, { conflict: false, currentVersion: null, errors: cause.fields });
	}
	if (cause instanceof NotFoundError) {
		error(404);
	}
	throw cause;
}

function notFoundAsPage(cause: unknown): never {
	if (cause instanceof NotFoundError) {
		error(404);
	}
	throw cause;
}

/** Newest first; with `?q=` the search's hits instead, best first. */
export async function loadNotesList(url: URL) {
	const query = (url.searchParams.get('q') ?? '').trim().slice(0, 200);
	if (query.length === 0) {
		return { notes: await listNotes(), query };
	}
	const hits = await searchNotes(query, SEARCH_PAGE_LIMIT);
	const notes: NoteSummary[] = hits.map((hit) => ({
		id: hit.id,
		title: hit.title,
		excerpt: hit.snippet,
		updatedAt: hit.updatedAt,
		deletedAt: null
	}));
	return { notes, query };
}

export async function loadTrash() {
	return {
		notes: await listNotes({ trashed: true }),
		retentionDays: getEnv().TRASH_RETENTION_DAYS
	};
}

/** A note with its history, plus the revision to preview when `revision` names one. */
export async function loadNoteData(id: string, revision: number | null) {
	const current = await getNote(id);
	const revisions = await listRevisions(id);

	let preview: NotePreview | null = null;
	if (revision !== null) {
		const found = await getRevision(id, revision);
		preview = { version: found.version, title: found.title, content: found.content };
	}
	return { note: current, revisions, preview };
}

/**
 * The editor page. `draftKey` identifies one editing session: the page keeps it while a new note
 * turns into a saved one, so the editor is not rebuilt under the owner's cursor.
 */
export async function loadNotePage(id: string, url: URL) {
	const shared = { map: await mapConfig(), uploadMaxBytes: getEnv().UPLOAD_MAX_BYTES };
	if (id === NEW_NOTE_ID) {
		return {
			note: null,
			revisions: [],
			preview: null,
			features: [],
			tokens: [],
			draftKey: crypto.randomUUID(),
			...shared
		};
	}

	const requested = noteVersionSchema.safeParse(url.searchParams.get('revision'));
	const revision = url.searchParams.has('revision') && requested.success ? requested.data : null;
	try {
		const data = await loadNoteData(id, revision);
		const [features, tokens] = await Promise.all([listNoteFeatures(id), listNoteTokens(id)]);
		return { ...data, features, tokens, draftKey: id, ...shared };
	} catch (cause) {
		return notFoundAsPage(cause);
	}
}

/** Stores an image pasted or picked in the editor and answers with its address. */
export async function uploadImage({ request, locals }: RequestEvent) {
	const { user } = requireUser(locals);
	if (isUploadLimited(user.id)) {
		return fail(429, { src: null, message: m.files_error_upload_rate() });
	}
	const data = await request.formData();
	const upload = data.get('image');
	if (!(upload instanceof File)) {
		return fail(400, { src: null, message: m.validation_file_empty() });
	}
	try {
		const stored = await storeUpload(upload, { ownerModule: NOTES_MODULE, allowSvg: false });
		return { src: `/files/${stored.id}`, message: '' };
	} catch (cause) {
		if (cause instanceof FileRejectedError) {
			return fail(400, { src: null, message: fileRejectionMessage(cause.reason, false) });
		}
		throw cause;
	}
}

export const noteActions = {
	create: async ({ request, locals }: RequestEvent) => {
		const { user } = requireUser(locals);
		const data = await request.formData();
		try {
			const created = await createNote(
				{
					title: textValue(data, 'title'),
					content: parseContent(textValue(data, 'content'))
				},
				ownerActor(user.id)
			);
			return { id: created.id, version: created.version };
		} catch (cause) {
			return writeFailure(cause);
		}
	},

	save: async ({ request, locals, params }: RequestEvent) => {
		const { user } = requireUser(locals);
		const data = await request.formData();
		const baseVersion = noteVersionSchema.safeParse(textValue(data, 'version'));
		if (!baseVersion.success) {
			return fail(400, { conflict: false, currentVersion: null, errors: {} });
		}
		try {
			const saved = await updateNote(
				params.id ?? '',
				{
					title: textValue(data, 'title'),
					content: parseContent(textValue(data, 'content')),
					baseVersion: baseVersion.data
				},
				ownerActor(user.id)
			);
			return { id: saved.id, version: saved.version };
		} catch (cause) {
			return writeFailure(cause);
		}
	},

	upload: uploadImage,

	createToken: createNoteTokenAction,

	trash: async ({ locals, params }: RequestEvent) => {
		requireUser(locals);
		try {
			await trashNote(params.id ?? '');
		} catch (cause) {
			notFoundAsPage(cause);
		}
		redirect(303, localizeHref('/notes'));
	},

	restoreRevision: async ({ request, locals, params }: RequestEvent) => {
		const { user } = requireUser(locals);
		const data = await request.formData();
		const version = noteVersionSchema.safeParse(textValue(data, 'revision'));
		if (!version.success) {
			error(404);
		}
		try {
			await restoreRevision(params.id ?? '', version.data, ownerActor(user.id));
		} catch (cause) {
			notFoundAsPage(cause);
		}
		redirect(303, localizeHref(`/notes/${params.id}`));
	}
};

export const trashActions = {
	restore: async ({ request, locals }: RequestEvent) => {
		requireUser(locals);
		const data = await request.formData();
		try {
			await restoreNote(textValue(data, 'id'));
		} catch (cause) {
			notFoundAsPage(cause);
		}
		return { message: m.notes_restored() };
	},

	delete: async ({ request, locals }: RequestEvent) => {
		requireUser(locals);
		const data = await request.formData();
		try {
			await deleteNotePermanently(textValue(data, 'id'));
		} catch (cause) {
			if (cause instanceof ValidationError) {
				return fail(400, { message: m.notes_error_not_trashed() });
			}
			notFoundAsPage(cause);
		}
		return { message: m.notes_deleted() };
	}
};
