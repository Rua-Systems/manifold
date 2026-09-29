import { sql } from 'drizzle-orm';
import { bigint, index, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import type { ActorType } from '../actor';
import { session, user } from './auth-schema';

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

export const sessionStepUp = pgTable('session_step_up', {
	id: uuid('id').primaryKey().defaultRandom(),
	sessionId: text('session_id')
		.notNull()
		.unique()
		.references(() => session.id, { onDelete: 'cascade' }),
	steppedUpAt: timestamptz('stepped_up_at').notNull(),
	createdAt: timestamptz('created_at').defaultNow().notNull(),
	updatedAt: timestamptz('updated_at').defaultNow().notNull()
});

export const auditEvent = pgTable(
	'audit_event',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		occurredAt: timestamptz('occurred_at').defaultNow().notNull(),
		actorType: text('actor_type').$type<ActorType>().notNull(),
		actorId: text('actor_id'),
		action: text('action').notNull(),
		targetType: text('target_type'),
		targetId: text('target_id'),
		ip: text('ip'),
		userAgent: text('user_agent'),
		metadata: jsonb('metadata')
			.$type<Record<string, unknown>>()
			.notNull()
			.default(sql`'{}'::jsonb`),
		createdAt: timestamptz('created_at').defaultNow().notNull(),
		updatedAt: timestamptz('updated_at').defaultNow().notNull()
	},
	(table) => [
		index('audit_event_occurred_at_idx').on(table.occurredAt.desc()),
		index('audit_event_actor_idx').on(table.actorType, table.actorId),
		index('audit_event_action_idx').using('btree', table.action.op('text_pattern_ops'))
	]
);

export const userSetting = pgTable('user_setting', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: text('user_id')
		.notNull()
		.unique()
		.references(() => user.id, { onDelete: 'cascade' }),
	locale: text('locale').$type<'en' | 'tr'>(),
	theme: text('theme').$type<'light' | 'dark'>(),
	createdAt: timestamptz('created_at').defaultNow().notNull(),
	updatedAt: timestamptz('updated_at').defaultNow().notNull()
});
