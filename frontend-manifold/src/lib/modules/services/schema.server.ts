import { file } from '$lib/server/db/schema';
import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Mirror of migrations/0004_services_init.sql. The SQL file is the source of truth.

export const service = pgTable(
	'service',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		alias: text('alias').notNull(),
		url: text('url').notNull(),
		iconFileId: uuid('icon_file_id').references(() => file.id, { onDelete: 'set null' }),
		position: integer('position').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
	},
	(table) => [
		index('service_icon_file_id_idx').on(table.iconFileId),
		index('service_position_idx').on(table.position)
	]
);
