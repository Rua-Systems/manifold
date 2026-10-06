import { fieldErrors } from '$lib/utils/validation';
import type { z } from 'zod';
import { assertNoteGrant } from '../api/credentials';
import { ApiError, invalidRequest } from '../api/errors';
import type { ApiResponse, ApiRoute, HttpMethod } from '../api/types';
import type { McpContext } from './types';

// MCP tools run the REST routes' handlers, so both share validation, service functions and
// output shapes; only the way in differs.

export function findRoute(routes: readonly ApiRoute[], method: HttpMethod, path: string): ApiRoute {
	const route = routes.find(
		(candidate) => candidate.method === method && candidate.path === path
	);
	if (route === undefined) {
		throw new Error(`No API route ${method} ${path} to build a tool from.`);
	}
	return route;
}

function parseWith(schema: z.ZodType | undefined, input: unknown): unknown {
	if (schema === undefined) {
		return undefined;
	}
	const parsed = schema.safeParse(input ?? {});
	if (!parsed.success) {
		throw invalidRequest(fieldErrors(parsed.error));
	}
	return parsed.data;
}

export interface RouteRequest {
	params?: Record<string, unknown>;
	query?: Record<string, unknown>;
	body?: unknown;
}

/** Runs a route's handler as the key behind the MCP request. */
export async function callRoute(
	route: ApiRoute,
	request: RouteRequest,
	context: McpContext
): Promise<ApiResponse> {
	const params = parseWith(route.params, request.params);
	assertNoteGrant(context.key, route.noteToken, params);
	const result = await route.handler({
		params,
		query: parseWith(route.query, request.query),
		body: parseWith(route.body, request.body),
		key: context.key,
		actor: context.actor,
		origin: context.origin,
		request: new Request('http://localhost/mcp')
	} as never);
	if (result.response !== undefined) {
		throw new ApiError(500, 'internal_error', 'This route cannot answer a tool.');
	}
	return result;
}
