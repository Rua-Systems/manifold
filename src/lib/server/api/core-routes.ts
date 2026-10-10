import { z } from 'zod';
import { search, SEARCH_LIMIT_MAX } from '../search';
import { defineRoute, type ApiRoute } from './types';

// Routes of the core rather than of a module: the search and the key itself.

export const CORE_ROUTES: ApiRoute[] = [
	defineRoute({
		method: 'GET',
		path: '/search',
		scope: null,
		tag: 'search',
		summary: 'Search every module',
		description:
			'Hits of every module the key may read, merged into one list, best first. A module the key has no read scope for is left out, silently.',
		query: z.object({
			q: z.string().trim().min(1).max(200).meta({ description: 'The words to find.' }),
			types: z
				.string()
				.optional()
				.transform((value) =>
					value === undefined
						? []
						: value
								.split(',')
								.map((type) => type.trim())
								.filter((type) => type.length > 0)
				)
				.meta({
					description: 'Comma separated types, such as `note,service`; all when left out.'
				}),
			limit: z.coerce.number().int().min(1).max(SEARCH_LIMIT_MAX).default(20)
		}),
		response: {
			status: 200,
			description: 'The hits.',
			schema: z.object({
				data: z.array(
					z.object({
						type: z.string(),
						id: z.string(),
						title: z.string(),
						snippet: z.string(),
						link: z
							.string()
							.meta({ description: 'An app path, or the address of a service.' }),
						score: z.number()
					})
				)
			})
		},
		handler: async ({ query, key }) => {
			const hits = await search(query.q, {
				types: query.types,
				scopes: key.scopes,
				limit: query.limit
			});
			return {
				body: {
					data: hits.map((hit) => ({
						type: hit.type,
						id: hit.id,
						title: hit.title,
						snippet: hit.snippet,
						link: hit.href,
						score: Math.round(hit.score * 1000) / 1000
					}))
				}
			};
		}
	}),
	defineRoute({
		method: 'GET',
		path: '/me',
		scope: null,
		noteToken: 'read',
		tag: 'key',
		summary: 'Describe the key making the request',
		response: {
			status: 200,
			description: 'The key.',
			schema: z.object({
				name: z.string(),
				scopes: z.array(z.string()),
				expires_at: z.string().nullable(),
				note: z
					.object({ id: z.string(), access: z.enum(['read', 'edit']) })
					.nullable()
					.meta({
						description: 'For a note token, the note it reaches and how; else null.'
					})
			})
		},
		handler: async ({ key }) => ({
			body: {
				name: key.name,
				scopes: key.scopes,
				expires_at: key.expiresAt?.toISOString() ?? null,
				note: key.note ?? null
			}
		})
	})
];
