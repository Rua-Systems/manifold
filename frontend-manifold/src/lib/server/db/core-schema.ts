import { bigint, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth-schema';

// Mirror of the core tables in migrations/. The SQL files are the source of truth.

function timestamptz(name: string) {
	return timestamp(name, { withTimezone: true });
}

export const knownUserAgent = pgTable(
	'known_user_agent',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		userAgentHash: text('user_agent_hash').notNull(),
		createdAt: timestamptz('created_at').defaultNow().notNull(),
		updatedAt: timestamptz('updated_at').defaultNow().notNull()
	},
	(table) => [unique('known_user_agent_user_agent_unique').on(table.userId, table.userAgentHash)]
);

export const file = pgTable(
	'file',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		storageKey: text('storage_key').notNull().unique(),
		originalName: text('original_name').notNull(),
		mimeType: text('mime_type').notNull(),
		sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
		sha256: text('sha256').notNull(),
		ownerModule: text('owner_module').notNull(),
		createdAt: timestamptz('created_at').defaultNow().notNull(),
		updatedAt: timestamptz('updated_at').defaultNow().notNull()
	},
	(table) => [index('file_created_at_idx').on(table.createdAt)]
);
