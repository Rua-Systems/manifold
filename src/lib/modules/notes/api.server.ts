import { decodeCursor, pageOf, pageQuery, pageSchema } from '$lib/server/api/paging';
import { VERSION_MAX } from '$lib/schemas/rules';
import { defineRoute, type ApiRoute } from '$lib/server/api/types';
import { z } from 'zod';
import type { NoteContent } from './content';
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

// /api/v1/notes: the same service functions as the note pages, so validation, revisions and
// file tracking are identical. Content goes in and out as TipTap JSON, Markdown or both.

const TAG = 'notes';

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

const createBody = z.object(contentFields).refine(eitherContentOrMarkdown, EITHER);

const updateBody = z
	.object({
		version: z.number().int().min(1).max(VERSION_MAX).meta({
			description:
				'The version the change is based on; a different stored version answers 409.'
		}),
		...contentFields
	})
	.refine(eitherContentOrMarkdown, EITHER);

const contentOutput = {
	content: z.record(z.string(), z.unknown()).optional(),
	markdown: z.string().optional()
};

const noteResource = z.object({
	id: z.string(),
	title: z.string(),
	version: z.number().int(),
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
		created_at: note.createdAt.toISOString(),
		updated_at: note.updatedAt.toISOString(),
		deleted_at: note.deletedAt?.toISOString() ?? null,
		...withContent(note.content, format)
	};
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
		body: createBody,
		response: { status: 201, description: 'The new note.', schema: noteResource },
		audit: 'note.create',
		handler: async ({ body, actor }) => {
			const created = await createNote(
				{ title: body.title, content: contentOf(body) },
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
			'Every change writes a new version and a new revision. A `version` other than the stored one answers 409 with `current_version`. A note token with edit access changes its own note only.',
		params: idParams,
		body: updateBody,
		response: { status: 200, description: 'The changed note.', schema: noteResource },
		audit: 'note.update',
		handler: async ({ params, body, actor }) => {
			const updated = await updateNote(
				params.id,
				{ title: body.title, content: contentOf(body), baseVersion: body.version },
				actor
			);
			return {
				body: toNoteResource(updated, 'both'),
				target: { type: 'note', id: updated.id }
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
	})
];
