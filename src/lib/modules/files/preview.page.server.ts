import { m } from '$lib/paraglide/messages.js';
import { localizeHref } from '$lib/paraglide/runtime.js';
import { NotFoundError } from '$lib/server/errors';
import { requireUser } from '$lib/server/guard';
import { textValue } from '$lib/utils/validation';
import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { allFolders, deleteFile, getFileDetail } from './library.server';
import { filesActions, filesFailure } from './page.server';
import type { FileDetail } from './types';

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

export const filePreviewActions = {
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
