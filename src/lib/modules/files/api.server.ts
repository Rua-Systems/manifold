import { ApiError, fileRejectedError } from '$lib/server/api/errors';
import { decodeCursor, pageOf, pageQuery, pageSchema } from '$lib/server/api/paging';
import { defineRoute, type ApiRoute } from '$lib/server/api/types';
import { getEnv } from '$lib/server/env';
import { API_FILE_OWNER, findFile, readFileStart, serveFile } from '$lib/server/files/files';
import {
	receiveUploads,
	UploadFormatError,
	type ReceivedUploads
} from '$lib/server/files/upload-stream';
import { z } from 'zod';
import {
	adoptIntoFiles,
	allFolders,
	createFolder,
	deleteFile,
	deleteFolder,
	getFileDetail,
	getFolder,
	listFilePage,
	moveFiles,
	moveFolder,
	renameFile,
	renameFolder
} from './library.server';
import { FILE_NAME_MAX_LENGTH, FOLDER_NAME_MAX_LENGTH } from './schemas';
import type { FileSummary, FolderSummary } from './types';

// /api/v1/files and /api/v1/file-folders: the functions of the Files page for scripts and agents.
// Folders have a path of their own, since `/files/{id}` would also match `/files/folders`.

const TAG = 'files';
const KINDS = ['image', 'pdf', 'audio', 'video', 'text', 'other'] as const;
/** In `folder_id`, the top level of the Files module. */
const TOP = 'root';
const TEXT_DEFAULT_BYTES = 100 * 1024;
const TEXT_MAX_BYTES = 1024 * 1024;

const idParams = z.object({ id: z.string().meta({ description: 'The file id.' }) });
const folderParams = z.object({ id: z.string().meta({ description: 'The folder id.' }) });

const useResource = z.object({
	module: z.string(),
	label: z.string(),
	link: z.string().meta({ description: 'The app path of the place, such as `/notes/{id}`.' }),
	trashed: z.boolean().meta({ description: 'The place is in a trash and may come back.' })
});

const fileResource = z.object({
	id: z.string(),
	name: z.string(),
	mime_type: z.string(),
	kind: z.enum(KINDS),
	size: z.number().int(),
	url: z
		.string()
		.meta({ description: 'Where the file is served, for an image `src` or a link.' }),
	created_at: z.string(),
	owner: z.string().meta({
		description: 'The module that keeps the file: `files`, `notes`, `services` or `api`.'
	}),
	in_files: z.boolean().meta({
		description:
			'Kept by the Files module: it can be renamed and moved, and stays until deleted.'
	}),
	folder_id: z.string().nullable().meta({
		description: 'Its folder in the Files module; null at the top or outside the module.'
	}),
	uses: z.array(useResource).meta({
		description: 'The places that show the file. A file in use cannot be deleted.'
	})
});

const folderResource = z.object({
	id: z.string(),
	name: z.string(),
	parent_id: z.string().nullable().meta({ description: 'Null for a folder at the top.' })
});

const fileCursor = z.object({ c: z.iso.datetime(), i: z.uuid() });

const parentField = z
	.string()
	.nullable()
	.meta({ description: 'A folder id, or null for the top.' });

function toFileResource(item: FileSummary): z.output<typeof fileResource> {
	return {
		id: item.id,
		name: item.name,
		mime_type: item.mimeType,
		kind: item.kind,
		size: item.sizeBytes,
		url: `/files/${item.id}`,
		created_at: item.createdAt.toISOString(),
		owner: item.ownerModule,
		in_files: item.inFiles,
		folder_id: item.folderId,
		uses: item.uses.map((use) => ({
			module: use.module,
			label: use.label,
			link: use.href,
			trashed: use.trashed
		}))
	};
}

function toFolderResource(folder: FolderSummary): z.output<typeof folderResource> {
	return { id: folder.id, name: folder.name, parent_id: folder.parentId };
}

async function fileOr404(id: string): Promise<FileSummary> {
	const found = await getFileDetail(id);
	if (found === null) {
		throw new ApiError(404, 'not_found', 'File was not found.');
	}
	return found;
}

async function folderOr404(id: string): Promise<FolderSummary> {
	const found = await getFolder(id);
	if (found === null) {
		throw new ApiError(404, 'not_found', 'Folder was not found.');
	}
	return found;
}

/** `root` or nothing at all means the top level for a target folder. */
function targetFolder(value: string | null): string | null {
	if (value === null || value === TOP) {
		return null;
	}
	return value;
}

async function receive(request: Request): Promise<ReceivedUploads> {
	try {
		// Stored as an API upload first: the folder field may come after the file in the form.
		return await receiveUploads(request, {
			ownerModule: API_FILE_OWNER,
			maxBytes: getEnv().UPLOAD_MAX_BYTES,
			maxFiles: 1,
			accept: 'any'
		});
	} catch (cause) {
		if (cause instanceof UploadFormatError) {
			throw new ApiError(400, 'invalid_request', 'Send the file as multipart/form-data.');
		}
		throw cause;
	}
}

const fileRoutes: ApiRoute[] = [
	defineRoute({
		method: 'GET',
		path: '/files',
		scope: 'files:read',
		tag: TAG,
		summary: 'List files, newest first',
		description:
			'Every stored file unless narrowed: by a folder of the Files module (`root` for its top level), by the module that keeps it, by name, by kind, or to files nothing uses.',
		query: pageQuery.extend({
			folder_id: z.string().max(40).optional().meta({
				description:
					'Files in this folder of the Files module, or `root` for its top level.'
			}),
			owner: z.string().max(40).optional().meta({
				description: 'Files that this module keeps: `files`, `notes`, `services` or `api`.'
			}),
			q: z.string().max(200).optional().meta({ description: 'Part of the name.' }),
			kind: z.enum(KINDS).optional(),
			unused: z.stringbool().default(false).meta({ description: 'Only files nothing uses.' })
		}),
		response: {
			status: 200,
			description: 'A page of files.',
			schema: pageSchema(fileResource)
		},
		handler: async ({ query }) => {
			let after: { createdAt: Date; id: string } | undefined;
			if (query.cursor !== undefined) {
				const position = decodeCursor(query.cursor, fileCursor);
				after = { createdAt: new Date(position.c), id: position.i };
			}
			let folderId = query.folder_id;
			if (folderId === TOP) {
				folderId = '';
			}
			const rows = await listFilePage({
				folderId,
				owner: query.owner,
				filter: { query: query.q ?? '', kind: query.kind ?? 'all', unused: query.unused },
				limit: query.limit,
				after
			});
			const page = pageOf(rows, query.limit, (last) => ({
				c: last.createdAt.toISOString(),
				i: last.id
			}));
			return { body: { data: page.data.map(toFileResource), next_cursor: page.nextCursor } };
		}
	}),
	defineRoute({
		method: 'POST',
		path: '/files',
		scope: 'files:write',
		tag: TAG,
		summary: 'Upload a file',
		description:
			'Any file up to `UPLOAD_MAX_BYTES`. Images, PDF, audio, video and text are recognised from the content and get their type; anything else is stored as `application/octet-stream` and always downloaded. With a `folder_id` field, a folder id or `root`, the Files module keeps the file there. Without one the file is a loose upload: it is deleted after a day unless a note or a service refers to it.',
		multipart: { field: 'file', description: 'The file.' },
		response: { status: 201, description: 'The stored file.', schema: fileResource },
		audit: 'file.create',
		handler: async ({ request }) => {
			const received = await receive(request);
			const [rejected] = received.rejected;
			if (rejected !== undefined) {
				throw fileRejectedError(rejected.reason);
			}
			const [stored] = received.files;
			if (stored === undefined) {
				throw new ApiError(400, 'invalid_request', 'The form needs a "file" field.');
			}
			const folder = received.fields.get('folder_id');
			if (folder !== undefined) {
				await adoptIntoFiles([stored.id], targetFolder(folder));
			}
			return {
				status: 201,
				body: toFileResource(await fileOr404(stored.id)),
				target: { type: 'file', id: stored.id }
			};
		}
	}),
	defineRoute({
		method: 'GET',
		path: '/files/{id}',
		scope: 'files:read',
		tag: TAG,
		summary: 'Download a file',
		description:
			'The file itself, inline for images, PDF, audio, video and text and as a download for anything else. A `Range` header is answered with `206` and that part.',
		params: idParams,
		response: { status: 200, description: 'The file.', contentType: '*/*' },
		handler: async ({ params, request }) => {
			const stored = await findFile(params.id);
			let response: Response | null = null;
			if (stored !== null) {
				response = await serveFile(stored, request);
			}
			if (response === null) {
				throw new ApiError(404, 'not_found', 'File was not found.');
			}
			return { response };
		}
	}),
	defineRoute({
		method: 'GET',
		path: '/files/{id}/metadata',
		scope: 'files:read',
		tag: TAG,
		summary: 'Read what is known about a file',
		params: idParams,
		response: {
			status: 200,
			description: 'The file without its content.',
			schema: fileResource
		},
		handler: async ({ params }) => ({ body: toFileResource(await fileOr404(params.id)) })
	}),
	defineRoute({
		method: 'GET',
		path: '/files/{id}/text',
		scope: 'files:read',
		tag: TAG,
		summary: 'Read a text file',
		description:
			'The start of a file of kind `text` as a string; any other kind answers 422 `not_text`.',
		params: idParams,
		query: z.object({
			max_bytes: z.coerce
				.number()
				.int()
				.min(1)
				.max(TEXT_MAX_BYTES)
				.default(TEXT_DEFAULT_BYTES)
				.meta({ description: `How much to read, at most ${TEXT_MAX_BYTES} bytes.` })
		}),
		response: {
			status: 200,
			description: 'The text.',
			schema: z.object({
				id: z.string(),
				name: z.string(),
				mime_type: z.string(),
				text: z.string(),
				truncated: z.boolean().meta({ description: 'The file goes on after `max_bytes`.' })
			})
		},
		handler: async ({ params, query }) => {
			const found = await fileOr404(params.id);
			if (found.kind !== 'text') {
				throw new ApiError(422, 'not_text', 'This file is not a text file.');
			}
			const stored = await findFile(found.id);
			let bytes: Buffer | null = null;
			if (stored !== null) {
				bytes = await readFileStart(stored, query.max_bytes);
			}
			if (bytes === null) {
				throw new ApiError(404, 'not_found', 'File was not found.');
			}
			// `stream` drops a character the limit cut in two instead of mangling it.
			const text = new TextDecoder('utf-8').decode(bytes, { stream: true });
			return {
				body: {
					id: found.id,
					name: found.name,
					mime_type: found.mimeType,
					text,
					truncated: found.sizeBytes > query.max_bytes
				}
			};
		}
	}),
	defineRoute({
		method: 'PATCH',
		path: '/files/{id}',
		scope: 'files:write',
		tag: TAG,
		summary: 'Rename or move a file',
		description:
			'Only for files the Files module keeps; another module keeps its own files. `folder_id` null moves the file to the top.',
		params: idParams,
		body: z
			.object({
				name: z.string().max(FILE_NAME_MAX_LENGTH).optional(),
				folder_id: parentField.optional()
			})
			.refine((body) => body.name !== undefined || body.folder_id !== undefined, {
				message: 'Send name, folder_id or both.'
			}),
		response: { status: 200, description: 'The changed file.', schema: fileResource },
		audit: 'file.update',
		handler: async ({ params, body }) => {
			const found = await fileOr404(params.id);
			if (body.name !== undefined) {
				await renameFile(found.id, body.name);
			}
			if (body.folder_id !== undefined) {
				await moveFiles([found.id], body.folder_id);
			}
			return {
				body: toFileResource(await fileOr404(found.id)),
				target: { type: 'file', id: found.id }
			};
		}
	}),
	defineRoute({
		method: 'DELETE',
		path: '/files/{id}',
		scope: 'files:write',
		tag: TAG,
		summary: 'Delete a file',
		description:
			'Deletes a file for good. A file in use, see `uses`, is refused with 422 until nothing shows it.',
		params: idParams,
		response: { status: 204, description: 'The file is gone.' },
		audit: 'file.delete',
		handler: async ({ params }) => {
			const found = await fileOr404(params.id);
			await deleteFile(found.id);
			return { status: 204, target: { type: 'file', id: found.id } };
		}
	})
];

const folderRoutes: ApiRoute[] = [
	defineRoute({
		method: 'GET',
		path: '/file-folders',
		scope: 'files:read',
		tag: TAG,
		summary: 'List every folder of the Files module',
		response: {
			status: 200,
			description: 'All folders, by name; `parent_id` gives the tree.',
			schema: z.object({ data: z.array(folderResource) })
		},
		handler: async () => ({ body: { data: (await allFolders()).map(toFolderResource) } })
	}),
	defineRoute({
		method: 'POST',
		path: '/file-folders',
		scope: 'files:write',
		tag: TAG,
		summary: 'Create a folder',
		description: `A name of up to ${FOLDER_NAME_MAX_LENGTH} characters without slashes, unique within its folder whatever its case.`,
		body: z.object({
			name: z.string().max(FOLDER_NAME_MAX_LENGTH),
			parent_id: parentField.optional()
		}),
		response: { status: 201, description: 'The new folder.', schema: folderResource },
		audit: 'file_folder.create',
		handler: async ({ body }) => {
			const created = await createFolder({
				name: body.name,
				parentId: body.parent_id ?? null
			});
			return {
				status: 201,
				body: toFolderResource(created),
				target: { type: 'file_folder', id: created.id }
			};
		}
	}),
	defineRoute({
		method: 'PATCH',
		path: '/file-folders/{id}',
		scope: 'files:write',
		tag: TAG,
		summary: 'Rename or move a folder',
		description: 'A folder cannot move into itself or a folder inside it.',
		params: folderParams,
		body: z
			.object({
				name: z.string().max(FOLDER_NAME_MAX_LENGTH).optional(),
				parent_id: parentField.optional()
			})
			.refine((body) => body.name !== undefined || body.parent_id !== undefined, {
				message: 'Send name, parent_id or both.'
			}),
		response: { status: 200, description: 'The changed folder.', schema: folderResource },
		audit: 'file_folder.update',
		handler: async ({ params, body }) => {
			const found = await folderOr404(params.id);
			if (body.name !== undefined) {
				await renameFolder(found.id, body.name);
			}
			if (body.parent_id !== undefined) {
				await moveFolder(found.id, body.parent_id);
			}
			return {
				body: toFolderResource(await folderOr404(found.id)),
				target: { type: 'file_folder', id: found.id }
			};
		}
	}),
	defineRoute({
		method: 'DELETE',
		path: '/file-folders/{id}',
		scope: 'files:write',
		tag: TAG,
		summary: 'Delete an empty folder',
		description: 'A folder with folders or files inside is refused with 422.',
		params: folderParams,
		response: { status: 204, description: 'The folder is gone.' },
		audit: 'file_folder.delete',
		handler: async ({ params }) => {
			const found = await folderOr404(params.id);
			await deleteFolder(found.id);
			return { status: 204, target: { type: 'file_folder', id: found.id } };
		}
	})
];

export const filesApiRoutes: ApiRoute[] = [...fileRoutes, ...folderRoutes];
