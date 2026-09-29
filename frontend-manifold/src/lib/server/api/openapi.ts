import { z } from 'zod';
import type { ApiRoute } from './types';

// The OpenAPI 3.1 document, built from the route definitions and their Zod schemas, so the
// document and the checks the router runs cannot drift apart.

type JsonSchema = Record<string, unknown>;

function jsonSchema(schema: z.ZodType, io: 'input' | 'output'): JsonSchema {
	const result = z.toJSONSchema(schema, {
		target: 'draft-2020-12',
		io,
		unrepresentable: 'any'
	}) as JsonSchema;
	delete result.$schema;
	return result;
}

function parameters(schema: z.ZodObject | undefined, location: 'path' | 'query'): JsonSchema[] {
	if (schema === undefined) {
		return [];
	}
	const converted = jsonSchema(schema, 'input');
	const properties = (converted.properties ?? {}) as Record<string, JsonSchema>;
	const required = new Set((converted.required ?? []) as string[]);
	return Object.entries(properties).map(([name, property]) => {
		const { description, ...rest } = property;
		return {
			name,
			in: location,
			required: location === 'path' || required.has(name),
			...(typeof description === 'string' ? { description } : {}),
			schema: rest
		};
	});
}

const ERROR_RESPONSES: Record<string, string> = {
	'400': 'The request is malformed.',
	'401': 'The key is missing, unknown, revoked or expired.',
	'403': 'The key lacks the scope this operation needs.',
	'404': 'Nothing exists at this address.',
	'429': 'The key made too many requests; see the RateLimit headers.'
};

function errorResponse(description: string): JsonSchema {
	return {
		description,
		content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
	};
}

function operationId(route: ApiRoute): string {
	const words = route.path
		.split('/')
		.filter((part) => part.length > 0)
		.map((part) =>
			part
				.replace(/[{}]/g, '')
				.replace(/[^a-zA-Z0-9]+(.)?/g, (_, next: string) => next?.toUpperCase() ?? '')
		)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1));
	return `${route.method.toLowerCase()}${words.join('')}`;
}

function operation(route: ApiRoute): JsonSchema {
	const scopeNote =
		route.scope === null ? 'Any valid key.' : `Needs the \`${route.scope}\` scope.`;
	const responses: Record<string, JsonSchema> = {};
	const success: JsonSchema = { description: route.response.description };
	if (route.response.schema !== undefined) {
		success.content = {
			'application/json': { schema: jsonSchema(route.response.schema, 'output') }
		};
	} else if (route.response.contentType !== undefined) {
		success.content = {
			[route.response.contentType]: { schema: { type: 'string', format: 'binary' } }
		};
	}
	responses[String(route.response.status)] = success;
	for (const [status, description] of Object.entries(ERROR_RESPONSES)) {
		responses[status] = errorResponse(description);
	}
	if (route.method !== 'GET') {
		responses['409'] = errorResponse('The record changed since the version the request names.');
		responses['413'] = errorResponse('The body is larger than the limit.');
		responses['422'] = errorResponse('The input is well formed but was not accepted.');
	}

	const result: JsonSchema = {
		operationId: operationId(route),
		tags: [route.tag],
		summary: route.summary,
		description: [route.description, scopeNote].filter(Boolean).join('\n\n'),
		security: [{ bearerAuth: [] }],
		'x-scope': route.scope,
		parameters: [...parameters(route.params, 'path'), ...parameters(route.query, 'query')],
		responses
	};
	if (route.body !== undefined) {
		result.requestBody = {
			required: true,
			content: { 'application/json': { schema: jsonSchema(route.body, 'input') } }
		};
	} else if (route.multipart !== undefined) {
		result.requestBody = {
			required: true,
			content: {
				'multipart/form-data': {
					schema: {
						type: 'object',
						properties: {
							[route.multipart.field]: {
								type: 'string',
								format: 'binary',
								description: route.multipart.description
							}
						},
						required: [route.multipart.field]
					}
				}
			}
		};
	}
	return result;
}

export function buildOpenApiDocument(
	routes: readonly ApiRoute[],
	info: { title: string; version: string; serverUrl: string }
): JsonSchema {
	const paths: Record<string, Record<string, JsonSchema>> = {};
	for (const route of routes) {
		paths[route.path] ??= {};
		paths[route.path][route.method.toLowerCase()] = operation(route);
	}
	return {
		openapi: '3.1.0',
		info: {
			title: info.title,
			version: info.version,
			description:
				'Every request needs `Authorization: Bearer <key>`. Keys are made in Settings, API Keys, and each operation names the scope it needs. Lists page with `limit` and `cursor`.'
		},
		servers: [{ url: info.serverUrl }],
		paths,
		components: {
			securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
			schemas: {
				Error: {
					type: 'object',
					required: ['error'],
					properties: {
						error: {
							type: 'object',
							required: ['code', 'message'],
							properties: {
								code: { type: 'string' },
								message: { type: 'string' },
								fields: {
									type: 'object',
									additionalProperties: { type: 'string' },
									description: 'Messages by field, when the input was refused.'
								},
								current_version: {
									type: 'integer',
									description: 'On a version conflict: the stored version.'
								}
							}
						}
					}
				}
			}
		}
	};
}
