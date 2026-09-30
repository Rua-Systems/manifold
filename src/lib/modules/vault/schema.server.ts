import { customType, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Mirror of migrations/0009_vault_init.sql. The SQL file is the source of truth.

function timestamptz(name: string) {
	return timestamp(name, { withTimezone: true });
}

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

export const vaultSecret = pgTable(
	'vault_secret',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		name: text('name').notNull(),
		serviceUrl: text('service_url'),
		description: text('description'),
		ciphertext: bytea('ciphertext').notNull(),
		iv: bytea('iv').notNull(),
		authTag: bytea('auth_tag').notNull(),
		keyVersion: integer('key_version').notNull().default(1),
		lastRevealedAt: timestamptz('last_revealed_at'),
		createdAt: timestamptz('created_at').defaultNow().notNull(),
		updatedAt: timestamptz('updated_at').defaultNow().notNull()
	},
	(table) => [index('vault_secret_name_idx').on(sql`lower(${table.name})`)]
);
