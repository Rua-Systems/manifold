import { m } from '$lib/paraglide/messages.js';
import { getEnv } from '$lib/server/env';
import { NotFoundError, ValidationError } from '$lib/server/errors';
import { deleteUnreferencedFile } from '$lib/server/files/files';
import { fileRejectionMessage } from '$lib/server/files/messages';
import {
	receiveUploads,
	UploadFormatError,
	type ReceivedUploads
} from '$lib/server/files/upload-stream';
import { requireUser } from '$lib/server/guard';
import { isFileUploadLimited } from '$lib/server/rate-limit';
import { textValue } from '$lib/utils/validation';
import { error, fail, type ActionFailure, type RequestEvent } from '@sveltejs/kit';
import { FILES_MODULE, FILES_PER_REQUEST } from './constants';

/** How many files the note editor's picker offers at once. */
const PICKER_LIMIT = 40;
import {
	allFolders,
	createFolder,
	deleteFile,
	deleteFolder,
	filterFiles,
	folderPath,
	getFolder,
	keepUploads,
	listFolder,
	listSource,
	listSources,
	moveFiles,
	moveFolder,
	pickableFiles,
	renameFile,
	renameFolder
} from './library.server';
import { parseKind, parseSort } from './schemas';
import type { FilesAction, FilesFilter, FilesFormState, FilesView } from './types';

// Load and form actions behind /files. The route files only re-export these.

function done(action: FilesAction, message: string): FilesFormState {
	return { action, success: true, message, errors: {} };
}

/** Answers a refused change with its field errors, a missing record with 404. */
export function filesFailure(action: FilesAction, cause: unknown): ActionFailure<FilesFormState> {
	if (cause instanceof ValidationError) {
		const message = cause.fields.file ?? cause.fields.folder ?? cause.fields.target ?? '';
		return fail(400, { action, success: false, message, errors: cause.fields });
	}
	if (cause instanceof NotFoundError) {
		return fail(404, { action, success: false, message: m.files_error_missing(), errors: {} });
	}
	throw cause;
}

/** A folder id from a form or an address; empty means the top. */
function folderValue(value: string | null): string | null {
	if (value === null || value.trim() === '') {
		return null;
	}
	return value;
}

async function loadView(url: URL, filter: FilesFilter): Promise<FilesView> {
	const sort = parseSort(url.searchParams.get('sort'));
	if (filter.query.trim() !== '' || filter.kind !== 'all' || filter.unused) {
		return { kind: 'filter', files: await filterFiles(filter, sort) };
	}

	const source = url.searchParams.get('source');
	if (source !== null) {
		const sources = await listSources();
		const found = sources.find((item) => item.module === source);
		if (found === undefined) {
			error(404, { message: m.files_error_missing() });
		}
		return { kind: 'source', source: found, files: await listSource(source, sort) };
	}

	const folderId = folderValue(url.searchParams.get('folder'));
	if (folderId === null) {
		const [contents, sources] = await Promise.all([listFolder(null, sort), listSources()]);
		return { kind: 'folder', folderId: null, path: [], sources, ...contents };
	}
	const folder = await getFolder(folderId);
	if (folder === null) {
		error(404, { message: m.files_error_missing() });
	}
	const [contents, path] = await Promise.all([
		listFolder(folder.id, sort),
		folderPath(folder.id)
	]);
	return { kind: 'folder', folderId: folder.id, path, sources: [], ...contents };
}

export async function loadFilesPage(url: URL) {
	const filter: FilesFilter = {
		query: url.searchParams.get('q') ?? '',
		kind: parseKind(url.searchParams.get('kind')),
		unused: url.searchParams.get('unused') === '1'
	};
	const [view, folders] = await Promise.all([loadView(url, filter), allFolders()]);
	return {
		view,
		filter,
		sort: parseSort(url.searchParams.get('sort')),
		folders,
		uploadMaxBytes: getEnv().UPLOAD_MAX_BYTES
	};
}

/**
 * Streams the files of the request into the Files module, into the folder of its `folder` field.
 * The page sends one file per request to show its progress; without JavaScript the form sends all.
 */
async function upload({ request, locals }: RequestEvent) {
	const { user } = requireUser(locals);
	if (isFileUploadLimited(user.id)) {
		return fail(429, {
			action: 'upload' as const,
			success: false,
			message: m.files_error_upload_rate(),
			errors: {}
		});
	}

	const maxBytes = getEnv().UPLOAD_MAX_BYTES;
	let received: ReceivedUploads;
	try {
		received = await receiveUploads(request, {
			ownerModule: FILES_MODULE,
			maxBytes,
			maxFiles: FILES_PER_REQUEST,
			accept: 'any'
		});
	} catch (cause) {
		if (cause instanceof UploadFormatError) {
			return fail(400, {
				action: 'upload' as const,
				success: false,
				message: m.files_error_upload_broken(),
				errors: {}
			});
		}
		throw cause;
	}

	const ids = received.files.map((item) => item.id);
	const folderId = folderValue(received.fields.get('folder') ?? null);
	if (folderId !== null && (await getFolder(folderId)) === null) {
		// The folder was deleted while the files were on their way; they are not kept.
		for (const id of ids) {
			await deleteUnreferencedFile(id, []);
		}
		return filesFailure('upload', new NotFoundError('Folder'));
	}
	await keepUploads(ids, folderId);

	const rejected = received.rejected.map((item) => ({
		name: item.name,
		message: fileRejectionMessage(item.reason, { allowSvg: true, maxBytes })
	}));
	const state: FilesFormState = {
		action: 'upload',
		success: ids.length > 0 || rejected.length === 0,
		message: m.files_uploaded({ count: ids.length }),
		errors: {},
		uploaded: ids.length,
		rejected
	};
	if (!state.success) {
		return fail(400, state);
	}
	return state;
}

export const filesActions = {
	createFolder: async ({ request, locals }: RequestEvent) => {
		requireUser(locals);
		const data = await request.formData();
		try {
			await createFolder({
				name: textValue(data, 'name'),
				parentId: folderValue(textValue(data, 'parent'))
			});
		} catch (cause) {
			return filesFailure('createFolder', cause);
		}
		return done('createFolder', m.files_folder_created());
	},

	renameFolder: async ({ request, locals }: RequestEvent) => {
		requireUser(locals);
		const data = await request.formData();
		try {
			await renameFolder(textValue(data, 'id'), textValue(data, 'name'));
		} catch (cause) {
			return filesFailure('renameFolder', cause);
		}
		return done('renameFolder', m.files_folder_renamed());
	},

	moveFolder: async ({ request, locals }: RequestEvent) => {
		requireUser(locals);
		const data = await request.formData();
		try {
			await moveFolder(textValue(data, 'id'), folderValue(textValue(data, 'target')));
		} catch (cause) {
			return filesFailure('moveFolder', cause);
		}
		return done('moveFolder', m.files_moved());
	},

	deleteFolder: async ({ request, locals }: RequestEvent) => {
		requireUser(locals);
		const data = await request.formData();
		try {
			await deleteFolder(textValue(data, 'id'));
		} catch (cause) {
			return filesFailure('deleteFolder', cause);
		}
		return done('deleteFolder', m.files_folder_deleted());
	},

	upload,

	renameFile: async ({ request, locals }: RequestEvent) => {
		requireUser(locals);
		const data = await request.formData();
		try {
			await renameFile(textValue(data, 'id'), textValue(data, 'name'));
		} catch (cause) {
			return filesFailure('renameFile', cause);
		}
		return done('renameFile', m.files_renamed());
	},

	moveFile: async ({ request, locals }: RequestEvent) => {
		requireUser(locals);
		const data = await request.formData();
		const ids = data.getAll('id').filter((value): value is string => typeof value === 'string');
		try {
			await moveFiles(ids, folderValue(textValue(data, 'target')));
		} catch (cause) {
			return filesFailure('moveFile', cause);
		}
		return done('moveFile', m.files_moved());
	},

	/** The files the note editor's picker offers: the newest, or those whose name matches. */
	browse: async ({ request, locals }: RequestEvent) => {
		requireUser(locals);
		const data = await request.formData();
		const state: FilesFormState = {
			...done('browse', ''),
			files: await pickableFiles(textValue(data, 'q').trim(), PICKER_LIMIT)
		};
		return state;
	},

	deleteFile: async ({ request, locals }: RequestEvent) => {
		requireUser(locals);
		const data = await request.formData();
		try {
			await deleteFile(textValue(data, 'id'));
		} catch (cause) {
			return filesFailure('deleteFile', cause);
		}
		return done('deleteFile', m.files_deleted());
	}
};
