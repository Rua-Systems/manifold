import { apiKey } from '$lib/server/db/schema';
import { customType, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Mirror of migrations/0009_vault_init.sql and 0014_vault_api_key_copy.sql. The SQL files are the
// source of truth.

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
		/** Set on the copy of an API key; revoking the key deletes the entry. */
		apiKeyId: uuid('api_key_id')
			.unique()
			.references(() => apiKey.id, { onDelete: 'cascade' }),
		createdAt: timestamptz('created_at').defaultNow().notNull(),
		updatedAt: timestamptz('updated_at').defaultNow().notNull()
	},
	(table) => [index('vault_secret_name_idx').on(sql`lower(${table.name})`)]
);
