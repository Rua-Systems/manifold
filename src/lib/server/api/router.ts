import { fieldErrors } from '$lib/utils/validation';
import type { z } from 'zod';
import { assertNoteGrant, authenticateCredential, credentialActor } from './credentials';
import { recordAudit, type AuditOrigin } from '../audit';
import { getEnv } from '../env';
import { consumeApiRequest, type RateLimitState } from '../rate-limit';
import { ApiError, apiErrorFrom, errorResponse, invalidRequest, jsonResponse } from './errors';
import { API_BASE_PATH, apiRoutes } from './routes';
import type { ApiRoute } from './types';
import { log, logSecurityEvent } from '../log';

// Serves /api/v1: finds the route, authenticates the Bearer key, applies the key's rate limit,
// checks the scope, validates the input, runs the handler and records writes in the audit log.
// Session cookies play no part here.

interface CompiledRoute {
	route: ApiRoute;
	pattern: RegExp;
	names: string[];
}

function compile(route: ApiRoute): CompiledRoute {
	const names: string[] = [];
	const source = route.path.replace(/\{([a-z_]+)\}/gi, (_, name: string) => {
		names.push(name);
		return '([^/]+)';
	});
	return { route, pattern: new RegExp(`^${source}$`), names };
}

let compiled: CompiledRoute[] | undefined;

function compiledRoutes(): CompiledRoute[] {
	compiled ??= apiRoutes().map(compile);
	return compiled;
}

function rateLimitHeaders(
	state: RateLimitState,
	limit: number,
	now: number
): Record<string, string> {
	return {
		'RateLimit-Limit': String(limit),
		'RateLimit-Remaining': String(state.remaining),
		'RateLimit-Reset': String(Math.max(0, Math.ceil((state.resetAt - now) / 1000)))
	};
}

function parseWith<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
	const parsed = schema.safeParse(input);
	if (!parsed.success) {
		throw invalidRequest(fieldErrors(parsed.error));
	}
	return parsed.data;
}

async function readJson(request: Request): Promise<unknown> {
	const type = request.headers.get('content-type') ?? '';
	if (!type.toLowerCase().startsWith('application/json')) {
		throw new ApiError(
			400,
			'invalid_json',
			'Send the body as JSON with Content-Type application/json.'
		);
	}
	try {
		return await request.json();
	} catch {
		throw new ApiError(400, 'invalid_json', 'The body is not valid JSON.');
	}
}

function bearerToken(request: Request): string | null {
	const header = request.headers.get('authorization') ?? '';
	return /^Bearer\s+(\S+)\s*$/i.exec(header)?.[1] ?? null;
}

export interface ApiRequestOptions {
	origin: AuditOrigin;
}

export async function handleApiRequest(
	request: Request,
	options: ApiRequestOptions
): Promise<Response> {
	const url = new URL(request.url);
	const path = url.pathname.slice(API_BASE_PATH.length) || '/';

	const matching = compiledRoutes().filter((candidate) => candidate.pattern.test(path));
	if (matching.length === 0) {
		return errorResponse(new ApiError(404, 'not_found', 'There is no such endpoint.'));
	}
	const found = matching.find((candidate) => candidate.route.method === request.method);
	if (found === undefined) {
		const allowed = matching.map((candidate) => candidate.route.method).join(', ');
		return errorResponse(new ApiError(405, 'method_not_allowed', `Use ${allowed}.`), {
			Allow: allowed
		});
	}
	const { route } = found;

	const token = bearerToken(request);
	if (token === null) {
		logSecurityEvent('missing_key', { path, ip: options.origin.ip });
		return errorResponse(
			new ApiError(401, 'missing_key', 'Send an API key as `Authorization: Bearer <key>`.'),
			{ 'WWW-Authenticate': 'Bearer' }
		);
	}
	const key = await authenticateCredential(token, { ip: options.origin.ip });
	if (key === null) {
		logSecurityEvent('invalid_key', { path, ip: options.origin.ip });
		return errorResponse(
			new ApiError(401, 'invalid_key', 'The API key is unknown, revoked or expired.'),
			{ 'WWW-Authenticate': 'Bearer error="invalid_token"' }
		);
	}

	const limit = getEnv().API_RATE_LIMIT_PER_MINUTE;
	const now = Date.now();
	const rate = consumeApiRequest(key.id, limit, now);
	const headers = rateLimitHeaders(rate, limit, now);
	if (rate.limited) {
		logSecurityEvent('rate_limited', { bucket: 'api', keyId: key.id, path });
		return errorResponse(new ApiError(429, 'rate_limited', 'Too many requests for this key.'), {
			...headers,
			'Retry-After': headers['RateLimit-Reset']
		});
	}
	if (route.scope !== null && !key.scopes.includes(route.scope)) {
		logSecurityEvent('insufficient_scope', { keyId: key.id, scope: route.scope, path });
		return errorResponse(
			new ApiError(403, 'insufficient_scope', `This key lacks the "${route.scope}" scope.`),
			headers
		);
	}

	const actor = credentialActor(key);
	try {
		const captured = found.pattern.exec(path) ?? [];
		const rawParams = Object.fromEntries(
			found.names.map((name, index) => [name, decodeURIComponent(captured[index + 1] ?? '')])
		);
		const params = route.params === undefined ? undefined : parseWith(route.params, rawParams);
		assertNoteGrant(key, route.noteToken, params);
		const context = {
			params,
			query:
				route.query === undefined
					? undefined
					: parseWith(route.query, Object.fromEntries(url.searchParams)),
			body:
				route.body === undefined
					? undefined
					: parseWith(route.body, await readJson(request)),
			key,
			actor,
			origin: options.origin,
			request
		};
		const result = await route.handler(context as never);

		if (route.audit !== undefined) {
			await recordAudit({
				actor,
				action: route.audit,
				target: result.target,
				origin: options.origin
			});
		}
		if (result.response !== undefined) {
			for (const [name, value] of Object.entries(headers)) {
				result.response.headers.set(name, value);
			}
			return result.response;
		}
		if (result.body === undefined) {
			return new Response(null, { status: result.status ?? 204, headers });
		}
		return jsonResponse(result.status ?? 200, result.body, headers);
	} catch (cause) {
		const known = apiErrorFrom(cause);
		if (known !== null) {
			return errorResponse(known, headers);
		}
		log('error', 'API request failed', { method: request.method, path }, cause);
		return errorResponse(new ApiError(500, 'internal_error', 'Something went wrong.'), headers);
	}
}
