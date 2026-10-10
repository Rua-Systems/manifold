import { m } from '$lib/paraglide/messages.js';
import { localizeHref } from '$lib/paraglide/runtime.js';
import { NotFoundError } from '$lib/server/errors';
import { imageMaxBytes } from '$lib/server/files/files';
import { fileRejectionMessage } from '$lib/server/files/messages';
import {
	receiveUploads,
	UploadFormatError,
	type ReceivedUploads
} from '$lib/server/files/upload-stream';
import { requireUser } from '$lib/server/guard';
import { isFileUploadLimited } from '$lib/server/rate-limit';
import { textValue } from '$lib/utils/validation';
import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { FILES_MODULE } from './constants';
import { allFolders, deleteFile, getFileDetail, keepUploads } from './library.server';
import { filesActions, filesFailure } from './page.server';
import type { FileDetail, FilesFormState } from './types';

// Load and form actions behind /files/view/<id>, the page that shows one file.

/** The Files page address of the place a file lives. */
export function locationHref(detail: FileDetail): string {
	if (detail.location.kind === 'source') {
		return `/files?source=${encodeURIComponent(detail.location.module)}`;
	}
	const folder = detail.location.path.at(-1);
	if (folder === undefined) {
		return '/files';
	}
	return `/files?folder=${folder.id}`;
}

export async function loadFilePreview(id: string) {
	const detail = await getFileDetail(id);
	if (detail === null) {
		error(404, { message: m.files_error_missing() });
	}
	return { file: detail, folders: await allFolders(), back: locationHref(detail) };
}

function editFailure(status: number, message: string) {
	const state: FilesFormState = { action: 'saveEdited', success: false, message, errors: {} };
	return fail(status, state);
}

/**
 * Keeps the copy the image editor made, beside the original: in its folder, or at the top of the
 * Files module when another module keeps the original. The original stays as it is.
 */
async function saveEdited({ request, locals, params }: RequestEvent) {
	const { user } = requireUser(locals);
	if (isFileUploadLimited(user.id)) {
		return editFailure(429, m.files_error_upload_rate());
	}
	const original = await getFileDetail(params.id ?? '');
	if (original === null) {
		return editFailure(404, m.files_error_missing());
	}
	let received: ReceivedUploads;
	try {
		received = await receiveUploads(request, {
			ownerModule: FILES_MODULE,
			maxBytes: imageMaxBytes(),
			maxFiles: 1,
			accept: 'image'
		});
	} catch (cause) {
		if (cause instanceof UploadFormatError) {
			return editFailure(400, m.files_error_upload_broken());
		}
		throw cause;
	}
	const [rejected] = received.rejected;
	if (rejected !== undefined) {
		return editFailure(
			400,
			fileRejectionMessage(rejected.reason, { allowSvg: false, maxBytes: imageMaxBytes() })
		);
	}
	const [copy] = received.files;
	if (copy === undefined) {
		return editFailure(400, m.validation_file_empty());
	}
	let folderId: string | null = null;
	if (original.inFiles) {
		folderId = original.folderId;
	}
	await keepUploads([copy.id], folderId);
	const state: FilesFormState = {
		action: 'saveEdited',
		success: true,
		message: m.files_edited_saved(),
		errors: {},
		id: copy.id
	};
	return state;
}

export const filePreviewActions = {
	saveEdited,
	renameFile: filesActions.renameFile,
	moveFile: filesActions.moveFile,

	/** Deletes the file and returns to the place it lived. */
	deleteFile: async ({ request, locals }: RequestEvent) => {
		requireUser(locals);
		const data = await request.formData();
		const detail = await getFileDetail(textValue(data, 'id'));
		if (detail === null) {
			return filesFailure('deleteFile', new NotFoundError('File'));
		}
		try {
			await deleteFile(detail.id);
		} catch (cause) {
			return filesFailure('deleteFile', cause);
		}
		redirect(303, localizeHref(locationHref(detail)));
	}
};
