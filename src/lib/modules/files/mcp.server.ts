import { callRoute, findRoute } from '$lib/server/mcp/routes';
import { defineTool, type McpTool } from '$lib/server/mcp/types';
import { z } from 'zod';
import { filesApiRoutes } from './api.server';

// MCP tools for files, running the /api/v1/files handlers. Agents read files; uploading and
// changing them stays with the API and the Files page.

const fileId = z.string().describe('The file id, a UUID as returned by list_files.');

const route = (method: 'GET', path: string) => findRoute(filesApiRoutes, method, path);

/** Query values travel as text, as they would in an address. */
function asText(value: boolean | undefined): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	return String(value);
}

export const filesMcpTools: McpTool[] = [
	defineTool({
		name: 'list_files',
		title: 'List files',
		scope: 'files:read',
		description:
			'Lists stored files, newest first: id, name, mime_type, kind (image, pdf, audio, video, text, other), size, url, owner, in_files, folder_id and uses. Narrow with folder_id (a folder of the Files module, or "root" for its top), owner (files, notes, services, api), query (part of the name), kind, or unused. Page with `cursor` from `next_cursor`. Needs the files:read scope.',
		input: z.object({
			folder_id: z.string().optional(),
			owner: z.string().optional(),
			query: z.string().max(200).optional(),
			kind: z.enum(['image', 'pdf', 'audio', 'video', 'text', 'other']).optional(),
			unused: z.boolean().optional(),
			limit: z.number().int().min(1).max(100).optional(),
			cursor: z.string().optional()
		}),
		handler: async (args, context) => {
			const { query, unused, ...rest } = args;
			const result = await callRoute(
				route('GET', '/files'),
				{ query: { ...rest, q: query, unused: asText(unused) } },
				context
			);
			return { data: result.body };
		}
	}),
	defineTool({
		name: 'get_file',
		title: 'Read file details',
		scope: 'files:read',
		description:
			'What is known about one file, without its content: name, type, size, where it is kept and the notes or services that use it. Needs the files:read scope.',
		input: z.object({ id: fileId }),
		handler: async (args, context) => {
			const result = await callRoute(
				route('GET', '/files/{id}/metadata'),
				{ params: args },
				context
			);
			return { data: result.body };
		}
	}),
	defineTool({
		name: 'read_file_text',
		title: 'Read a text file',
		scope: 'files:read',
		description:
			'The content of a file of kind text (TXT, Markdown, CSV, JSON, logs), up to max_bytes (100 KB unless given, at most 1 MB); `truncated` tells when the file goes on. Any other kind is refused. Needs the files:read scope.',
		input: z.object({
			id: fileId,
			max_bytes: z
				.number()
				.int()
				.min(1)
				.max(1024 * 1024)
				.optional()
		}),
		handler: async (args, context) => {
			const { id, max_bytes } = args;
			const result = await callRoute(
				route('GET', '/files/{id}/text'),
				{ params: { id }, query: { max_bytes } },
				context
			);
			return { data: result.body };
		}
	}),
	defineTool({
		name: 'list_file_folders',
		title: 'List file folders',
		scope: 'files:read',
		description:
			'Every folder of the Files module: id, name and parent_id, null for a folder at the top. Needs the files:read scope.',
		input: z.object({}),
		handler: async (_args, context) => {
			const result = await callRoute(
				findRoute(filesApiRoutes, 'GET', '/file-folders'),
				{},
				context
			);
			return { data: result.body };
		}
	})
];
