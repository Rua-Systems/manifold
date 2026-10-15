import { ApiError } from '$lib/server/api/errors';
import { decodeCursor, pageOf, pageQuery, pageSchema } from '$lib/server/api/paging';
import { FOLDER_NAME_MAX_LENGTH } from '$lib/schemas/names';
import { VERSION_MAX } from '$lib/schemas/rules';
import { defineRoute, type ApiRoute } from '$lib/server/api/types';
import type { FolderOption } from '$lib/types/folders';
import { z } from 'zod';
import type { NoteContent } from './content';
import {
	allNoteFolders,
	createNoteFolder,
	deleteNoteFolder,
	getNoteFolder,
	moveNoteFolder,
	moveNoteToFolder,
	renameNoteFolder
} from './folders.server';
import { markdownToNote, noteToMarkdown } from './markdown.server';
import {
	createNote,
	getNote,
	getRevision,
	listNotePage,
	listRevisions,
	restoreNote,
	restoreRevision,
	trashNote,
	updateNote
} from './notes.server';
import { NOTE_TITLE_MAX_LENGTH } from './schemas';
import type { NoteDetail } from './types';

// /api/v1/notes and /api/v1/note-folders: the same service functions as the note pages, so
// validation, revisions and file tracking are identical. Content goes in and out as TipTap JSON,
// Markdown or both.

const TAG = 'notes';

/** In `folder_id`, the top level of the notes. */
const TOP = 'root';

const formatQuery = z.object({
	format: z.enum(['json', 'markdown', 'both']).default('both').meta({
		description: 'Content as TipTap JSON (`content`), Markdown (`markdown`) or both.'
	})
});

type Format = z.output<typeof formatQuery>['format'];

const idParams = z.object({ id: z.string().meta({ description: 'The note id.' }) });

const revisionParams = idParams.extend({
	version: z.coerce
		.number()
		.int()
		.min(1)
		.max(VERSION_MAX)
		.meta({ description: 'The revision version.' })
});

const tiptapDocument = z
	.object({ type: z.literal('doc') })
	.loose()
	.meta({ description: 'A TipTap JSON document; unknown node and mark types are refused.' });

const contentFields = {
	title: z.string().max(NOTE_TITLE_MAX_LENGTH).optional(),
	content: tiptapDocument.optional(),
	markdown: z
		.string()
		.optional()
		.meta({ description: 'Markdown instead of `content`; raw HTML in it is dropped.' })
};

function eitherContentOrMarkdown(body: { content?: unknown; markdown?: string }): boolean {
	return body.content === undefined || body.markdown === undefined;
}

const EITHER = { message: 'Send either content or markdown, not both.', path: ['markdown'] };

const folderField = z
	.string()
	.nullable()
	.meta({ description: 'A folder id, or null for the top level.' });

const createBody = z
	.object({ ...contentFields, folder_id: folderField.optional() })
	.refine(eitherContentOrMarkdown, EITHER);

function changesContent(body: { title?: string; content?: unknown; markdown?: string }): boolean {
	return body.title !== undefined || body.content !== undefined || body.markdown !== undefined;
}

const updateBody = z
	.object({
		version: z.number().int().min(1).max(VERSION_MAX).optional().meta({
			description:
				'The version the change is based on; a different stored version answers 409. Needed with `title`, `content` or `markdown`.'
		}),
		...contentFields,
		folder_id: folderField.optional().meta({
			description:
				'Moves the note into this folder, or to the top level for null. A move changes neither the version nor `updated_at`.'
		})
	})
	.refine(eitherContentOrMarkdown, EITHER)
	.refine((body) => !changesContent(body) || body.version !== undefined, {
		message: 'Send the version the change is based on.',
		path: ['version']
	})
	.refine((body) => changesContent(body) || body.folder_id !== undefined, {
		message: 'Send title, content, markdown or folder_id.'
	});

const contentOutput = {
	content: z.record(z.string(), z.unknown()).optional(),
	markdown: z.string().optional()
};

const folderIdOutput = z
	.string()
	.nullable()
	.meta({ description: 'The folder the note is in; null at the top level.' });

const noteResource = z.object({
	id: z.string(),
	title: z.string(),
	version: z.number().int(),
	folder_id: folderIdOutput,
	created_at: z.string(),
	updated_at: z.string(),
	deleted_at: z.string().nullable(),
	...contentOutput
});

const noteListItem = z.object({
	id: z.string(),
	title: z.string(),
	excerpt: z.string(),
	version: z.number().int(),
	folder_id: folderIdOutput,
	updated_at: z.string(),
	deleted_at: z.string().nullable()
});

const revisionListItem = z.object({
	version: z.number().int(),
	title: z.string(),
	actor_type: z.enum(['owner', 'api_key', 'note_token', 'system']),
	actor_id: z.string().nullable(),
	created_at: z.string(),
	updated_at: z.string()
});

const revisionResource = revisionListItem.extend(contentOutput);

const folderResource = z.object({
	id: z.string(),
	name: z.string(),
	parent_id: z.string().nullable().meta({ description: 'Null for a folder at the top level.' })
});

const folderParams = z.object({ id: z.string().meta({ description: 'The folder id.' }) });

const noteCursor = z.object({ u: z.iso.datetime(), i: z.uuid() });
const revisionCursor = z.object({ v: z.number().int() });

/** TipTap JSON from either field, or undefined when the request changes no content. */
function contentOf(body: { content?: Record<string, unknown>; markdown?: string }): unknown {
	if (body.markdown !== undefined) {
		return markdownToNote(body.markdown);
	}
	return body.content;
}

function withContent(content: NoteContent, format: Format) {
	return {
		...(format === 'markdown' ? {} : { content }),
		...(format === 'json' ? {} : { markdown: noteToMarkdown(content) })
	};
}

function toNoteResource(note: NoteDetail, format: Format): z.output<typeof noteResource> {
	return {
		id: note.id,
		title: note.title,
		version: note.version,
		folder_id: note.folderId,
		created_at: note.createdAt.toISOString(),
		updated_at: note.updatedAt.toISOString(),
		deleted_at: note.deletedAt?.toISOString() ?? null,
		...withContent(note.content, format)
	};
}

function toFolderResource(folder: FolderOption): z.output<typeof folderResource> {
	return { id: folder.id, name: folder.name, parent_id: folder.parentId };
}

async function folderOr404(id: string): Promise<FolderOption> {
	const found = await getNoteFolder(id);
	if (found === null) {
		throw new ApiError(404, 'not_found', 'Folder was not found.');
	}
	return found;
}

/** The folder filter of a list: a folder id, `root` for the top level, or nothing for all. */
function folderFilter(value: string | undefined): string | null | undefined {
	if (value === TOP) {
		return null;
	}
	return value;
}

export const notesApiRoutes: ApiRoute[] = [
	defineRoute({
		method: 'GET',
		path: '/notes',
		scope: 'notes:read',
		tag: TAG,
		summary: 'List notes by last update',
		query: pageQuery.extend({
			q: z.string().max(200).optional().meta({ description: 'Matches title and text.' }),
			include_trashed: z.stringbool().default(false).meta({
				description: 'Include notes in the trash.'
			}),
			folder_id: z.string().max(40).optional().meta({
				description: 'Only the notes directly in this folder, or `root` for the top level.'
			})
		}),
		response: {
			status: 200,
			description: 'A page of notes.',
			schema: pageSchema(noteListItem)
		},
		handler: async ({ query }) => {
			const after =
				query.cursor === undefined ? undefined : decodeCursor(query.cursor, noteCursor);
			const rows = await listNotePage({
				query: query.q,
				includeTrashed: query.include_trashed,
				folderId: folderFilter(query.folder_id),
				limit: query.limit,
				after:
					after === undefined ? undefined : { updatedAt: new Date(after.u), id: after.i }
			});
			const page = pageOf(rows, query.limit, (last) => ({
				u: last.updatedAt.toISOString(),
				i: last.id
			}));
			return {
				body: {
					data: page.data.map((item) => ({
						id: item.id,
						title: item.title,
						excerpt: item.excerpt,
						version: item.version,
						folder_id: item.folderId,
						updated_at: item.updatedAt.toISOString(),
						deleted_at: item.deletedAt?.toISOString() ?? null
					})),
					next_cursor: page.nextCursor
				}
			};
		}
	}),
	defineRoute({
		method: 'POST',
		path: '/notes',
		scope: 'notes:write',
		tag: TAG,
		summary: 'Create a note',
		description: 'In a folder with `folder_id`, else at the top level.',
		body: createBody,
		response: { status: 201, description: 'The new note.', schema: noteResource },
		audit: 'note.create',
		handler: async ({ body, actor }) => {
			const created = await createNote(
				{ title: body.title, content: contentOf(body), folderId: body.folder_id ?? null },
				actor
			);
			return {
				status: 201,
				body: toNoteResource(created, 'both'),
				target: { type: 'note', id: created.id }
			};
		}
	}),
	defineRoute({
		method: 'GET',
		path: '/notes/{id}',
		scope: 'notes:read',
		noteToken: 'read',
		tag: TAG,
		summary: 'Read a note',
		description:
			'Notes in the trash can be read too; `deleted_at` tells. A note token reads its own note only.',
		params: idParams,
		query: formatQuery,
		response: { status: 200, description: 'The note.', schema: noteResource },
		handler: async ({ params, query }) => ({
			body: toNoteResource(await getNote(params.id, { includeTrashed: true }), query.format)
		})
	}),
	defineRoute({
		method: 'PATCH',
		path: '/notes/{id}',
		scope: 'notes:write',
		noteToken: 'edit',
		tag: TAG,
		summary: 'Change a note',
		description:
			'A change of title or content writes a new version and a new revision; a `version` other than the stored one answers 409 with `current_version`. `folder_id` alone moves the note without a new version. A note token with edit access changes its own note only, and cannot move it.',
		params: idParams,
		body: updateBody,
		response: { status: 200, description: 'The changed note.', schema: noteResource },
		audit: 'note.update',
		handler: async ({ params, body, actor }) => {
			if (body.folder_id !== undefined && actor.type === 'note_token') {
				throw new ApiError(
					403,
					'insufficient_scope',
					'A note token cannot move its note into a folder.'
				);
			}
			let id = params.id;
			if (body.version !== undefined && changesContent(body)) {
				const updated = await updateNote(
					params.id,
					{ title: body.title, content: contentOf(body), baseVersion: body.version },
					actor
				);
				id = updated.id;
			}
			if (body.folder_id !== undefined) {
				await moveNoteToFolder(id, body.folder_id);
			}
			const current = await getNote(id);
			return {
				body: toNoteResource(current, 'both'),
				target: { type: 'note', id: current.id }
			};
		}
	}),
	defineRoute({
		method: 'DELETE',
		path: '/notes/{id}',
		scope: 'notes:write',
		tag: TAG,
		summary: 'Move a note to the trash',
		params: idParams,
		response: { status: 204, description: 'The note is in the trash.' },
		audit: 'note.trash',
		handler: async ({ params }) => {
			const found = await getNote(params.id);
			await trashNote(found.id);
			return { status: 204, target: { type: 'note', id: found.id } };
		}
	}),
	defineRoute({
		method: 'POST',
		path: '/notes/{id}/restore',
		scope: 'notes:write',
		tag: TAG,
		summary: 'Take a note out of the trash',
		params: idParams,
		response: { status: 200, description: 'The restored note.', schema: noteResource },
		audit: 'note.restore',
		handler: async ({ params }) => {
			const restored = await restoreNote(params.id);
			return {
				body: toNoteResource(restored, 'both'),
				target: { type: 'note', id: restored.id }
			};
		}
	}),
	defineRoute({
		method: 'GET',
		path: '/notes/{id}/revisions',
		scope: 'notes:read',
		tag: TAG,
		summary: "List a note's revisions, newest first",
		params: idParams,
		query: pageQuery,
		response: {
			status: 200,
			description: 'A page of revisions.',
			schema: pageSchema(revisionListItem)
		},
		handler: async ({ params, query }) => {
			const after =
				query.cursor === undefined ? undefined : decodeCursor(query.cursor, revisionCursor);
			const all = await listRevisions(params.id);
			const rows = all.filter((item) => after === undefined || item.version < after.v);
			const page = pageOf(rows.slice(0, query.limit + 1), query.limit, (last) => ({
				v: last.version
			}));
			return {
				body: {
					data: page.data.map((item) => ({
						version: item.version,
						title: item.title,
						actor_type: item.actorType,
						actor_id: item.actorId,
						created_at: item.createdAt.toISOString(),
						updated_at: item.updatedAt.toISOString()
					})),
					next_cursor: page.nextCursor
				}
			};
		}
	}),
	defineRoute({
		method: 'GET',
		path: '/notes/{id}/revisions/{version}',
		scope: 'notes:read',
		tag: TAG,
		summary: 'Read a revision',
		params: revisionParams,
		query: formatQuery,
		response: { status: 200, description: 'The revision.', schema: revisionResource },
		handler: async ({ params, query }) => {
			const revision = await getRevision(params.id, params.version);
			return {
				body: {
					version: revision.version,
					title: revision.title,
					actor_type: revision.actorType,
					actor_id: revision.actorId,
					created_at: revision.createdAt.toISOString(),
					updated_at: revision.updatedAt.toISOString(),
					...withContent(revision.content, query.format)
				}
			};
		}
	}),
	defineRoute({
		method: 'POST',
		path: '/notes/{id}/revisions/{version}/restore',
		scope: 'notes:write',
		tag: TAG,
		summary: 'Restore a revision as a new version',
		params: revisionParams,
		response: {
			status: 200,
			description: 'The note with the restored content.',
			schema: noteResource
		},
		audit: 'note.revision_restore',
		handler: async ({ params, actor }) => {
			const restored = await restoreRevision(params.id, params.version, actor);
			return {
				body: toNoteResource(restored, 'both'),
				target: { type: 'note', id: restored.id }
			};
		}
	}),
	defineRoute({
		method: 'GET',
		path: '/note-folders',
		scope: 'notes:read',
		tag: TAG,
		summary: 'List every folder of notes',
		response: {
			status: 200,
			description: 'All folders, by name; `parent_id` gives the tree.',
			schema: z.object({ data: z.array(folderResource) })
		},
		handler: async () => ({ body: { data: (await allNoteFolders()).map(toFolderResource) } })
	}),
	defineRoute({
		method: 'POST',
		path: '/note-folders',
		scope: 'notes:write',
		tag: TAG,
		summary: 'Create a folder of notes',
		description: `A name of up to ${FOLDER_NAME_MAX_LENGTH} characters without slashes, unique within its folder whatever its case.`,
		body: z.object({
			name: z.string().max(FOLDER_NAME_MAX_LENGTH),
			parent_id: folderField.optional()
		}),
		response: { status: 201, description: 'The new folder.', schema: folderResource },
		audit: 'note_folder.create',
		handler: async ({ body }) => {
			const created = await createNoteFolder({
				name: body.name,
				parentId: body.parent_id ?? null
			});
			return {
				status: 201,
				body: toFolderResource(created),
				target: { type: 'note_folder', id: created.id }
			};
		}
	}),
	defineRoute({
		method: 'PATCH',
		path: '/note-folders/{id}',
		scope: 'notes:write',
		tag: TAG,
		summary: 'Rename or move a folder of notes',
		description: 'A folder cannot move into itself or a folder inside it.',
		params: folderParams,
		body: z
			.object({
				name: z.string().max(FOLDER_NAME_MAX_LENGTH).optional(),
				parent_id: folderField.optional()
			})
			.refine((body) => body.name !== undefined || body.parent_id !== undefined, {
				message: 'Send name, parent_id or both.'
			}),
		response: { status: 200, description: 'The changed folder.', schema: folderResource },
		audit: 'note_folder.update',
		handler: async ({ params, body }) => {
			const found = await folderOr404(params.id);
			if (body.name !== undefined) {
				await renameNoteFolder(found.id, body.name);
			}
			if (body.parent_id !== undefined) {
				await moveNoteFolder(found.id, body.parent_id);
			}
			return {
				body: toFolderResource(await folderOr404(found.id)),
				target: { type: 'note_folder', id: found.id }
			};
		}
	}),
	defineRoute({
		method: 'DELETE',
		path: '/note-folders/{id}',
		scope: 'notes:write',
		tag: TAG,
		summary: 'Delete an empty folder of notes',
		description:
			'A folder with folders or notes outside the trash inside is refused with 422. Notes in the trash that were in it move to the top level.',
		params: folderParams,
		response: { status: 204, description: 'The folder is gone.' },
		audit: 'note_folder.delete',
		handler: async ({ params }) => {
			const found = await folderOr404(params.id);
			await deleteNoteFolder(found.id);
			return { status: 204, target: { type: 'note_folder', id: found.id } };
		}
	})
];
