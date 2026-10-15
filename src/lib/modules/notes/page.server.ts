import { m } from '$lib/paraglide/messages.js';
import { localizeHref } from '$lib/paraglide/runtime.js';
import { ownerActor } from '$lib/server/actor';
import { getEnv } from '$lib/server/env';
import { ConflictError, NotFoundError, ValidationError } from '$lib/server/errors';
import { deleteUnreferencedFile, imageMaxBytes } from '$lib/server/files/files';
import { fileRejectionMessage } from '$lib/server/files/messages';
import {
	receiveUploads,
	UploadFormatError,
	type ReceivedUploads
} from '$lib/server/files/upload-stream';
import { fileKind } from '$lib/utils/file-kind';
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
import { folderValue, moveNoteAction } from './folders.page.server';
import { allNoteFolders, getNoteFolder, listNoteFolders, noteFolderPath } from './folders.server';
import { mapConfig } from './map/basemaps.server';
import { listNoteFeatures } from './map/features.server';
import { NEW_NOTE_ID } from './paths';
import { noteVersionSchema } from './schemas';
import { createNoteTokenAction } from './tokens.page.server';
import { listNoteTokens } from './tokens.server';
import type { AttachedFile, NoteFolderPath, NotePreview, NoteSummary } from './types';
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

/**
 * A folder of notes, or the top level: its folders by name and its notes, newest first. With
 * `?q=` the search's hits from every folder instead, best first.
 */
export async function loadNotesList(url: URL) {
	const query = (url.searchParams.get('q') ?? '').trim().slice(0, 200);
	const allFolders = await allNoteFolders();
	if (query.length > 0) {
		const hits = await searchNotes(query, SEARCH_PAGE_LIMIT);
		const notes: NoteSummary[] = hits.map((hit) => ({
			id: hit.id,
			title: hit.title,
			excerpt: hit.snippet,
			folderId: hit.folderId,
			updatedAt: hit.updatedAt,
			deletedAt: null
		}));
		return { notes, query, folder: null, path: [], folders: [], allFolders };
	}

	const folderId = folderValue(url.searchParams.get('folder'));
	if (folderId === null) {
		const [notes, folders] = await Promise.all([
			listNotes({ folderId: null }),
			listNoteFolders(null)
		]);
		return { notes, query, folder: null, path: [], folders, allFolders };
	}
	const folder = await getNoteFolder(folderId);
	if (folder === null) {
		error(404, { message: m.folders_error_missing() });
	}
	const [notes, folders, path] = await Promise.all([
		listNotes({ folderId: folder.id }),
		listNoteFolders(folder.id),
		noteFolderPath(folder.id)
	]);
	return { notes, query, folder, path, folders, allFolders };
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
	const shared = {
		map: await mapConfig(),
		uploadMaxBytes: getEnv().UPLOAD_MAX_BYTES,
		folders: await allNoteFolders()
	};
	if (id === NEW_NOTE_ID) {
		// A note started inside a folder is created there; an unknown folder means the top level.
		const folder = await getNoteFolder(url.searchParams.get('folder') ?? '');
		let path: NoteFolderPath = [];
		if (folder !== null) {
			path = await noteFolderPath(folder.id);
		}
		return {
			note: null,
			revisions: [],
			preview: null,
			features: [],
			tokens: [],
			draftKey: crypto.randomUUID(),
			newNoteFolderId: folder?.id ?? null,
			path,
			...shared
		};
	}

	const requested = noteVersionSchema.safeParse(url.searchParams.get('revision'));
	const revision = url.searchParams.has('revision') && requested.success ? requested.data : null;
	try {
		const data = await loadNoteData(id, revision);
		const [features, tokens, path] = await Promise.all([
			listNoteFeatures(id),
			listNoteTokens(id),
			noteFolderPath(data.note.folderId ?? '')
		]);
		return {
			...data,
			features,
			tokens,
			draftKey: id,
			newNoteFolderId: null,
			path,
			...shared
		};
	} catch (cause) {
		return notFoundAsPage(cause);
	}
}

function uploadFailure(status: number, message: string) {
	return fail(status, { file: null, message });
}

/**
 * Stores a file pasted, dropped or picked in the editor, streamed like any upload, and answers
 * what the editor needs to show it. Images stay under the image limit; the note shows them inline.
 */
export async function uploadFile({ request, locals }: RequestEvent) {
	const { user } = requireUser(locals);
	if (isUploadLimited(user.id)) {
		return uploadFailure(429, m.files_error_upload_rate());
	}
	const maxBytes = getEnv().UPLOAD_MAX_BYTES;
	let received: ReceivedUploads;
	try {
		received = await receiveUploads(request, {
			ownerModule: NOTES_MODULE,
			maxBytes,
			maxFiles: 1,
			accept: 'any'
		});
	} catch (cause) {
		if (cause instanceof UploadFormatError) {
			return uploadFailure(400, m.files_error_upload_broken());
		}
		throw cause;
	}

	const [rejected] = received.rejected;
	if (rejected !== undefined) {
		return uploadFailure(
			400,
			fileRejectionMessage(rejected.reason, { allowSvg: false, maxBytes })
		);
	}
	const [stored] = received.files;
	if (stored === undefined) {
		return uploadFailure(400, m.validation_file_empty());
	}
	if (fileKind(stored.mimeType) === 'image' && stored.sizeBytes > imageMaxBytes()) {
		await deleteUnreferencedFile(stored.id, []);
		return uploadFailure(
			400,
			fileRejectionMessage('too_large', { allowSvg: false, maxBytes: imageMaxBytes() })
		);
	}
	const file: AttachedFile = {
		src: `/files/${stored.id}`,
		name: stored.originalName,
		sizeBytes: stored.sizeBytes,
		mimeType: stored.mimeType
	};
	return { file, message: '' };
}

export const noteActions = {
	create: async ({ request, locals }: RequestEvent) => {
		const { user } = requireUser(locals);
		const data = await request.formData();
		try {
			const created = await createNote(
				{
					title: textValue(data, 'title'),
					content: parseContent(textValue(data, 'content')),
					folderId: folderValue(textValue(data, 'folder'))
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

	upload: uploadFile,

	moveNote: moveNoteAction,

	createToken: createNoteTokenAction,

	trash: async ({ locals, params }: RequestEvent) => {
		requireUser(locals);
		// Back to the folder the note was in.
		let back = '/notes';
		try {
			const found = await getNote(params.id ?? '');
			await trashNote(found.id);
			if (found.folderId !== null) {
				back = `/notes?folder=${found.folderId}`;
			}
		} catch (cause) {
			notFoundAsPage(cause);
		}
		redirect(303, localizeHref(back));
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
