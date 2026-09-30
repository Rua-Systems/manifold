import { decodeCursor, pageOf, pageQuery, pageSchema } from '$lib/server/api/paging';
import { defineRoute, type ApiRoute } from '$lib/server/api/types';
import { z } from 'zod';
import type { VaultSecretView } from './types';
import { getSecret, listSecrets } from './vault.server';

// /api/v1/vault: metadata only. No route returns or accepts a value.

const TAG = 'vault';

const secretResource = z.object({
	id: z.string(),
	name: z.string(),
	service_url: z.string().nullable(),
	description: z.string().nullable(),
	created_at: z.string(),
	updated_at: z.string()
});

function toResource(secret: VaultSecretView): z.output<typeof secretResource> {
	return {
		id: secret.id,
		name: secret.name,
		service_url: secret.serviceUrl,
		description: secret.description,
		created_at: secret.createdAt.toISOString(),
		updated_at: secret.updatedAt.toISOString()
	};
}

const offsetCursor = z.object({ o: z.number().int().min(0) });

export const vaultApiRoutes: ApiRoute[] = [
	defineRoute({
		method: 'GET',
		path: '/vault/secrets',
		scope: 'vault:read',
		tag: TAG,
		summary: 'List secrets by name, without their values',
		query: pageQuery,
		response: {
			status: 200,
			description: 'A page of secrets.',
			schema: pageSchema(secretResource)
		},
		handler: async ({ query }) => {
			const offset =
				query.cursor === undefined ? 0 : decodeCursor(query.cursor, offsetCursor).o;
			const rows = (await listSecrets()).slice(offset, offset + query.limit + 1);
			const page = pageOf(rows, query.limit, () => ({ o: offset + query.limit }));
			return { body: { data: page.data.map(toResource), next_cursor: page.nextCursor } };
		}
	}),
	defineRoute({
		method: 'GET',
		path: '/vault/secrets/{id}',
		scope: 'vault:read',
		tag: TAG,
		summary: "Read a secret's metadata, never its value",
		params: z.object({ id: z.string().meta({ description: 'The secret id.' }) }),
		response: {
			status: 200,
			description: 'The secret without its value.',
			schema: secretResource
		},
		handler: async ({ params }) => ({ body: toResource(await getSecret(params.id)) })
	})
];
