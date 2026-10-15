import { tag } from '$lib/server/db/schema';
import {
	index,
	integer,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import { memoryCategory } from '../schema.server';

// Mirror of migrations/0023_memory_prompts.sql. The SQL file is the source of truth.

function timestamptz(name: string) {
	return timestamp(name, { withTimezone: true });
}

export const memoryPrompt = pgTable(
	'memory_prompt',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		name: text('name').notNull(),
		title: text('title').notNull(),
		description: text('description').notNull().default(''),
		body: text('body').notNull(),
		categoryId: uuid('category_id').references(() => memoryCategory.id, {
			onDelete: 'restrict'
		}),
		version: integer('version').notNull().default(1),
		createdAt: timestamptz('created_at').defaultNow().notNull(),
		updatedAt: timestamptz('updated_at').defaultNow().notNull()
	},
	(table) => [
		uniqueIndex('memory_prompt_name_unique').on(table.name),
		index('memory_prompt_category_id_idx').on(table.categoryId),
		index('memory_prompt_updated_at_idx').on(table.updatedAt.desc())
	]
);

export const memoryPromptTag = pgTable(
	'memory_prompt_tag',
	{
		promptId: uuid('prompt_id')
			.notNull()
			.references(() => memoryPrompt.id, { onDelete: 'cascade' }),
		tagId: uuid('tag_id')
			.notNull()
			.references(() => tag.id, { onDelete: 'cascade' })
	},
	(table) => [
		primaryKey({ columns: [table.promptId, table.tagId] }),
		index('memory_prompt_tag_tag_id_idx').on(table.tagId)
	]
);
