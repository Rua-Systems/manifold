import { file } from '$lib/server/db/schema';
import {
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
	uuid
} from 'drizzle-orm/pg-core';
import type { NoteContent } from './content';

// Mirror of migrations/0005_notes_init.sql. The SQL file is the source of truth.

function timestamptz(name: string) {
	return timestamp(name, { withTimezone: true });
}

export const note = pgTable(
	'note',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		title: text('title').notNull().default(''),
		content: jsonb('content').$type<NoteContent>().notNull(),
		contentText: text('content_text').notNull().default(''),
		version: integer('version').notNull().default(1),
		deletedAt: timestamptz('deleted_at'),
		createdAt: timestamptz('created_at').defaultNow().notNull(),
		updatedAt: timestamptz('updated_at').defaultNow().notNull()
	},
	(table) => [
		index('note_updated_at_idx').on(table.updatedAt.desc()),
		index('note_deleted_at_idx').on(table.deletedAt)
	]
);

export const noteRevision = pgTable(
	'note_revision',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		noteId: uuid('note_id')
			.notNull()
			.references(() => note.id, { onDelete: 'cascade' }),
		version: integer('version').notNull(),
		title: text('title').notNull(),
		content: jsonb('content').$type<NoteContent>().notNull(),
		actorType: text('actor_type').$type<'owner' | 'api_key' | 'system'>().notNull(),
		actorId: text('actor_id'),
		createdAt: timestamptz('created_at').defaultNow().notNull(),
		updatedAt: timestamptz('updated_at').defaultNow().notNull()
	},
	(table) => [unique('note_revision_note_version_unique').on(table.noteId, table.version)]
);

export const noteFile = pgTable(
	'note_file',
	{
		noteId: uuid('note_id')
			.notNull()
			.references(() => note.id, { onDelete: 'cascade' }),
		fileId: uuid('file_id')
			.notNull()
			.references(() => file.id, { onDelete: 'cascade' })
	},
	(table) => [
		primaryKey({ columns: [table.noteId, table.fileId] }),
		index('note_file_file_id_idx').on(table.fileId)
	]
);
