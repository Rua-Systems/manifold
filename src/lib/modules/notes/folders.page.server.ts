import { m } from '$lib/paraglide/messages.js';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { requireUser } from '$lib/server/guard';
import type { FieldErrors } from '$lib/types/validation';
import { textValue } from '$lib/utils/validation';
import { fail, type ActionFailure, type RequestEvent } from '@sveltejs/kit';
import {
	createNoteFolder,
	deleteNoteFolder,
	moveNoteFolder,
	moveNoteToFolder,
	renameNoteFolder
} from './folders.server';

// Form actions for note folders, on the notes page and, for moving a note, on the note's page.

export type NoteFolderAction =
	'createFolder' | 'renameFolder' | 'moveFolder' | 'deleteFolder' | 'moveNote';

export interface NoteFolderFormState {
	action: NoteFolderAction;
	success: boolean;
	message: string;
	errors: FieldErrors;
}

function done(action: NoteFolderAction, message: string): NoteFolderFormState {
	return { action, success: true, message, errors: {} };
}

/** Answers a refused change with its field errors, and a missing folder or note in a message. */
function folderFailure(
	action: NoteFolderAction,
	cause: unknown
): ActionFailure<NoteFolderFormState> {
	if (cause instanceof ValidationError) {
		const message = cause.fields.folder ?? cause.fields.target ?? '';
		return fail(400, { action, success: false, message, errors: cause.fields });
	}
	if (cause instanceof NotFoundError) {
		return fail(404, {
			action,
			success: false,
			message: m.folders_error_missing(),
			errors: {}
		});
	}
	throw cause;
}

/** A folder id from a form field; empty means the top level. */
export function folderValue(value: string | null): string | null {
	if (value === null || value.trim() === '') {
		return null;
	}
	return value;
}

async function moveNote({ request, locals, params }: RequestEvent) {
	requireUser(locals);
	const data = await request.formData();
	// The note page posts for its own note; the notes page names the note.
	const id = params.id ?? textValue(data, 'id');
	try {
		await moveNoteToFolder(id, folderValue(textValue(data, 'target')));
		return done('moveNote', m.notes_moved());
	} catch (cause) {
		return folderFailure('moveNote', cause);
	}
}

export const noteFolderActions = {
	createFolder: async ({ request, locals }: RequestEvent) => {
		requireUser(locals);
		const data = await request.formData();
		try {
			await createNoteFolder({
				name: textValue(data, 'name'),
				parentId: folderValue(textValue(data, 'parent'))
			});
			return done('createFolder', m.notes_folder_created());
		} catch (cause) {
			return folderFailure('createFolder', cause);
		}
	},

	renameFolder: async ({ request, locals }: RequestEvent) => {
		requireUser(locals);
		const data = await request.formData();
		try {
			await renameNoteFolder(textValue(data, 'id'), textValue(data, 'name'));
			return done('renameFolder', m.notes_folder_renamed());
		} catch (cause) {
			return folderFailure('renameFolder', cause);
		}
	},

	moveFolder: async ({ request, locals }: RequestEvent) => {
		requireUser(locals);
		const data = await request.formData();
		try {
			await moveNoteFolder(textValue(data, 'id'), folderValue(textValue(data, 'target')));
			return done('moveFolder', m.notes_folder_moved());
		} catch (cause) {
			return folderFailure('moveFolder', cause);
		}
	},

	deleteFolder: async ({ request, locals }: RequestEvent) => {
		requireUser(locals);
		const data = await request.formData();
		try {
			await deleteNoteFolder(textValue(data, 'id'));
			return done('deleteFolder', m.notes_folder_deleted());
		} catch (cause) {
			return folderFailure('deleteFolder', cause);
		}
	},

	moveNote
};

/** The note page's own action: moves the note it shows. */
export const moveNoteAction = moveNote;
