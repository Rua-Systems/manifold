import { z } from 'zod';
import {
	fileResponse,
	findFile,
	readFileBytes,
	storeUpload,
	type StoredFile
} from '../files/files';
import { ApiError } from './errors';
import { defineRoute, type ApiRoute } from './types';

// Routes of the core rather than of a module: the key itself and uploaded files.

/** Files uploaded through the API belong to no module until a note or service refers to them. */
const API_FILE_OWNER = 'api';

const idParams = z.object({ id: z.string().meta({ description: 'The file id.' }) });

const fileResource = z.object({
	id: z.string(),
	name: z.string(),
	mime_type: z.string(),
	size: z.number().int(),
	url: z.string().meta({ description: 'Where the file is served; use it as an image `src`.' }),
	created_at: z.string()
});

function toFileResource(stored: StoredFile): z.output<typeof fileResource> {
	return {
		id: stored.id,
		name: stored.originalName,
		mime_type: stored.mimeType,
		size: stored.sizeBytes,
		url: `/files/${stored.id}`,
		created_at: stored.createdAt.toISOString()
	};
}

export const CORE_ROUTES: ApiRoute[] = [
	defineRoute({
		method: 'GET',
		path: '/me',
		scope: null,
		tag: 'key',
		summary: 'Describe the key making the request',
		response: {
			status: 200,
			description: 'The key.',
			schema: z.object({
				name: z.string(),
				scopes: z.array(z.string()),
				expires_at: z.string().nullable()
			})
		},
		handler: async ({ key }) => ({
			body: {
				name: key.name,
				scopes: key.scopes,
				expires_at: key.expiresAt?.toISOString() ?? null
			}
		})
	}),
	defineRoute({
		method: 'POST',
		path: '/files',
		scope: 'files:write',
		tag: 'files',
		summary: 'Upload an image',
		description:
			'PNG, JPEG, WebP or GIF, detected from the content. A file nothing refers to, such as an image in a note, is deleted after a day.',
		multipart: { field: 'file', description: 'The image.' },
		response: { status: 201, description: 'The stored file.', schema: fileResource },
		audit: 'file.create',
		handler: async ({ request }) => {
			let form: FormData;
			try {
				form = await request.formData();
			} catch {
				throw new ApiError(400, 'invalid_request', 'Send the file as multipart/form-data.');
			}
			const upload = form.get('file');
			if (!(upload instanceof File)) {
				throw new ApiError(400, 'invalid_request', 'The form needs a "file" field.');
			}
			const stored = await storeUpload(upload, { ownerModule: API_FILE_OWNER });
			return {
				status: 201,
				body: toFileResource(stored),
				target: { type: 'file', id: stored.id }
			};
		}
	}),
	defineRoute({
		method: 'GET',
		path: '/files/{id}',
		scope: 'files:read',
		tag: 'files',
		summary: 'Download a file',
		params: idParams,
		response: { status: 200, description: 'The file.', contentType: 'image/*' },
		handler: async ({ params }) => {
			const stored = await findFile(params.id);
			const bytes = stored === null ? null : await readFileBytes(stored);
			if (stored === null || bytes === null) {
				throw new ApiError(404, 'not_found', 'File was not found.');
			}
			return { response: fileResponse(stored, bytes) };
		}
	})
];
