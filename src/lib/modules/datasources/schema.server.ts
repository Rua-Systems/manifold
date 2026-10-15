import { sql } from 'drizzle-orm';
import {
	boolean,
	customType,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';
import type { DataSourceType } from './types';

// Mirror of migrations/0020_datasources_init.sql. The SQL file is the source of truth.

function timestamptz(name: string) {
	return timestamp(name, { withTimezone: true });
}

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

export const dataSource = pgTable(
	'data_source',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		name: text('name').notNull(),
		type: text('type').$type<DataSourceType>().notNull(),
		settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
		description: text('description').notNull().default(''),
		docsUrl: text('docs_url'),
		ciphertext: bytea('ciphertext').notNull(),
		iv: bytea('iv').notNull(),
		authTag: bytea('auth_tag').notNull(),
		keyVersion: integer('key_version').notNull().default(1),
		testedAt: timestamptz('tested_at'),
		testOk: boolean('test_ok'),
		testMessage: text('test_message'),
		createdAt: timestamptz('created_at').defaultNow().notNull(),
		updatedAt: timestamptz('updated_at').defaultNow().notNull()
	},
	(table) => [
		uniqueIndex('data_source_name_unique').on(sql`lower(${table.name})`),
		index('data_source_type_idx').on(table.type)
	]
);
