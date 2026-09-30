import { version } from '$app/environment';
import { moduleMcpTools } from '$lib/modules/registry.server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import type { Actor } from '../actor';
import { authenticateApiKey } from '../api-keys';
import { ApiError, apiErrorFrom, errorBody, errorResponse } from '../api/errors';
import { recordAudit, type AuditOrigin } from '../audit';
import { getEnv } from '../env';
import { consumeApiRequest } from '../rate-limit';
import { search, SEARCH_LIMIT_MAX } from '../search';
import { defineTool, type McpContext, type McpTool } from './types';

// /mcp: the Model Context Protocol over streamable HTTP, stateless. Every request authenticates
// with an API key, counts against the key's rate limit, and gets a server holding only the tools
// the key's scopes allow. Writes are audited like the REST API's.

const searchTool = defineTool({
	name: 'search',
	title: 'Search everything',
	scope: null,
	description:
		"Searches the owner's notes, services and vault entry names at once and returns the best hits first: type (note, service, secret), id, title, snippet and link. Only modules this key may read are searched. Use it to find a note's id before get_note or update_note.",
	input: z.object({
		query: z.string().min(1).max(200).describe('Words to find.'),
		types: z
			.array(z.enum(['note', 'service', 'secret']))
			.optional()
			.describe('Only these kinds of hits.'),
		limit: z.number().int().min(1).max(SEARCH_LIMIT_MAX).optional()
	}),
	handler: async (args, context) => {
		const hits = await search(args.query, {
			types: args.types,
			scopes: context.key.scopes,
			limit: args.limit
		});
		return {
			data: hits.map((hit) => ({
				type: hit.type,
				id: hit.id,
				title: hit.title,
				snippet: hit.snippet,
				link: hit.href
			}))
		};
	}
});

export function mcpTools(): McpTool[] {
	return [searchTool, ...moduleMcpTools()];
}

function toolText(value: unknown): { type: 'text'; text: string } {
	return { type: 'text', text: JSON.stringify(value, null, 2) };
}

function buildServer(context: McpContext): McpServer {
	const server = new McpServer({ name: getEnv().ORGANIZATION_NAME, version });
	const allowed = mcpTools().filter(
		(tool) => tool.scope === null || context.key.scopes.includes(tool.scope)
	);
	for (const tool of allowed) {
		server.registerTool(
			tool.name,
			{
				title: tool.title,
				description: tool.description,
				inputSchema: tool.input.shape,
				annotations: { readOnlyHint: tool.audit === undefined }
			},
			async (args) => {
				try {
					const result = await tool.handler(args as never, context);
					if (tool.audit !== undefined) {
						await recordAudit({
							actor: context.actor,
							action: tool.audit,
							target: result.target,
							metadata: { via: 'mcp' },
							origin: context.origin
						});
					}
					return { content: [toolText(result.data)] };
				} catch (cause) {
					const known = apiErrorFrom(cause);
					if (known === null) {
						console.error(`MCP tool ${tool.name} failed.`, cause);
						return {
							isError: true,
							content: [
								toolText(
									errorBody(
										new ApiError(500, 'internal_error', 'Something went wrong.')
									)
								)
							]
						};
					}
					return { isError: true, content: [toolText(errorBody(known))] };
				}
			}
		);
	}
	return server;
}

function bearerToken(request: Request): string | null {
	const header = request.headers.get('authorization') ?? '';
	return /^Bearer\s+(\S+)\s*$/i.exec(header)?.[1] ?? null;
}

export async function handleMcpRequest(
	request: Request,
	options: { origin: AuditOrigin }
): Promise<Response> {
	const token = bearerToken(request);
	const key = token === null ? null : await authenticateApiKey(token, { ip: options.origin.ip });
	if (key === null) {
		return errorResponse(
			new ApiError(
				401,
				'invalid_key',
				'Send a valid API key as `Authorization: Bearer <key>`.'
			),
			{ 'WWW-Authenticate': 'Bearer' }
		);
	}

	const limit = getEnv().API_RATE_LIMIT_PER_MINUTE;
	const now = Date.now();
	const rate = consumeApiRequest(key.id, limit, now);
	const headers: Record<string, string> = {
		'RateLimit-Limit': String(limit),
		'RateLimit-Remaining': String(rate.remaining),
		'RateLimit-Reset': String(Math.max(0, Math.ceil((rate.resetAt - now) / 1000)))
	};
	if (rate.limited) {
		return errorResponse(new ApiError(429, 'rate_limited', 'Too many requests for this key.'), {
			...headers,
			'Retry-After': headers['RateLimit-Reset']
		});
	}

	const actor: Actor = { type: 'api_key', id: key.id };
	const server = buildServer({ key, actor, origin: options.origin });
	// Stateless: a transport and a server per request, answered as plain JSON.
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true
	});
	await server.connect(transport);
	try {
		const response = await transport.handleRequest(request);
		for (const [name, value] of Object.entries(headers)) {
			response.headers.set(name, value);
		}
		return response;
	} finally {
		await server.close();
	}
}
