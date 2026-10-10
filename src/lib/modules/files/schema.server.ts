import { file } from '$lib/server/db/schema';
import { index, pgTable, text, timestamp, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';

// Mirror of migrations/0017_files_init.sql. The SQL file is the source of truth.

export const fileFolder = pgTable(
	'file_folder',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		parentId: uuid('parent_id').references((): AnyPgColumn => fileFolder.id, {
			onDelete: 'restrict'
		}),
		name: text('name').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [index('file_folder_parent_idx').on(table.parentId)]
);

export const fileEntry = pgTable(
	'file_entry',
	{
		fileId: uuid('file_id')
			.primaryKey()
			.references(() => file.id, { onDelete: 'cascade' }),
		folderId: uuid('folder_id').references(() => fileFolder.id, { onDelete: 'restrict' }),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [index('file_entry_folder_idx').on(table.folderId)]
);
