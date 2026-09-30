import { callRoute, findRoute } from '$lib/server/mcp/routes';
import { defineTool, type McpTool } from '$lib/server/mcp/types';
import { z } from 'zod';
import { notesApiRoutes } from './api.server';

// MCP tools for notes, running the /api/v1/notes handlers. Content goes both ways as Markdown.

const noteId = z.string().describe('The note id, a UUID as returned by list_notes.');

/** Tools see Markdown only; the TipTap JSON would double every answer for nothing. */
function withoutJson(body: unknown): unknown {
	if (typeof body !== 'object' || body === null) {
		return body;
	}
	const rest = { ...(body as Record<string, unknown>) };
	delete rest.content;
	return rest;
}

const route = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string) =>
	findRoute(notesApiRoutes, method, path);

export const notesMcpTools: McpTool[] = [
	defineTool({
		name: 'list_notes',
		title: 'List notes',
		scope: 'notes:read',
		description:
			"Lists the owner's notes, most recently updated first. Pass `query` to keep only notes whose title or text match it (words match by their start, titles also by similarity). Returns `data` (id, title, excerpt, version, updated_at, deleted_at) and `next_cursor`; pass that as `cursor` for the next page. Notes in the trash are left out unless `include_trashed` is true. Needs the notes:read scope.",
		input: z.object({
			query: z.string().max(200).optional().describe('Words to find in titles and text.'),
			include_trashed: z.boolean().optional().describe('Also list notes in the trash.'),
			limit: z
				.number()
				.int()
				.min(1)
				.max(100)
				.optional()
				.describe('Notes per page, 50 by default.'),
			cursor: z.string().optional().describe('The next_cursor of the previous page.')
		}),
		handler: async (args, context) => {
			const result = await callRoute(
				route('GET', '/notes'),
				{
					query: {
						q: args.query,
						include_trashed:
							args.include_trashed === undefined
								? undefined
								: String(args.include_trashed),
						limit: args.limit,
						cursor: args.cursor
					}
				},
				context
			);
			return { data: result.body };
		}
	}),
	defineTool({
		name: 'get_note',
		title: 'Read a note',
		scope: 'notes:read',
		description:
			'Reads one note with its content as Markdown, its `version` and its timestamps. Remember the version: update_note needs it. Notes in the trash can be read too (`deleted_at` is set). Needs the notes:read scope.',
		input: z.object({ id: noteId }),
		handler: async (args, context) => {
			const result = await callRoute(
				route('GET', '/notes/{id}'),
				{ params: { id: args.id }, query: { format: 'markdown' } },
				context
			);
			return { data: result.body };
		}
	}),
	defineTool({
		name: 'create_note',
		title: 'Create a note',
		scope: 'notes:write',
		description:
			'Creates a note from a title and Markdown content. Headings, lists, task lists, quotes, code blocks, links (http, https, mailto), tables and images already stored on this instance are kept; raw HTML is dropped. Returns the new note with its id and version 1. Needs the notes:write scope.',
		input: z.object({
			title: z.string().max(200).optional().describe('The title; may be empty.'),
			markdown: z.string().optional().describe('The content as Markdown.')
		}),
		audit: 'note.create',
		handler: async (args, context) => {
			const result = await callRoute(route('POST', '/notes'), { body: args }, context);
			return { data: withoutJson(result.body), target: result.target };
		}
	}),
	defineTool({
		name: 'update_note',
		title: 'Change a note',
		scope: 'notes:write',
		description:
			'Changes the title, the Markdown content, or both, of a note that is not in the trash. `version` must be the version you last read; if the note changed since, the call fails with the code "version_conflict" and the `current_version`: read the note again, merge, and retry with that version. Every change makes a new version and a revision. Needs the notes:write scope.',
		input: z.object({
			id: noteId,
			version: z.number().int().min(1).describe('The version the change is based on.'),
			title: z.string().max(200).optional().describe('A new title.'),
			markdown: z.string().optional().describe('New content as Markdown, replacing the old.')
		}),
		audit: 'note.update',
		handler: async (args, context) => {
			const { id, ...body } = args;
			const result = await callRoute(
				route('PATCH', '/notes/{id}'),
				{ params: { id }, body },
				context
			);
			return { data: withoutJson(result.body), target: result.target };
		}
	}),
	defineTool({
		name: 'trash_note',
		title: 'Move a note to the trash',
		scope: 'notes:write',
		description:
			'Moves a note to the trash, which also hides its map features. It can be restored with restore_note until the trash is emptied. Needs the notes:write scope.',
		input: z.object({ id: noteId }),
		audit: 'note.trash',
		handler: async (args, context) => {
			const result = await callRoute(
				route('DELETE', '/notes/{id}'),
				{ params: args },
				context
			);
			return { data: { id: args.id, trashed: true }, target: result.target };
		}
	}),
	defineTool({
		name: 'restore_note',
		title: 'Restore a note from the trash',
		scope: 'notes:write',
		description:
			'Takes a note out of the trash, with its map features. Returns the note. Needs the notes:write scope.',
		input: z.object({ id: noteId }),
		audit: 'note.restore',
		handler: async (args, context) => {
			const result = await callRoute(
				route('POST', '/notes/{id}/restore'),
				{ params: args },
				context
			);
			return { data: withoutJson(result.body), target: result.target };
		}
	}),
	defineTool({
		name: 'list_note_revisions',
		title: "List a note's revisions",
		scope: 'notes:read',
		description:
			"Lists a note's revisions, newest first: version, title, who wrote it (owner, api_key or system) and when. Returns `data` and `next_cursor`. Needs the notes:read scope.",
		input: z.object({
			id: noteId,
			limit: z.number().int().min(1).max(100).optional(),
			cursor: z.string().optional()
		}),
		handler: async (args, context) => {
			const result = await callRoute(
				route('GET', '/notes/{id}/revisions'),
				{ params: { id: args.id }, query: { limit: args.limit, cursor: args.cursor } },
				context
			);
			return { data: result.body };
		}
	})
];
