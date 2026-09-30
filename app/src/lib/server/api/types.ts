import type { z } from 'zod';
import type { Actor } from '../actor';
import type { ApiKeyIdentity } from '../api-keys';
import type { AuditOrigin } from '../audit';

// A REST route under /api/v1. Modules list theirs in their server manifest; the router serves
// them and the OpenAPI document describes them, both from the same definitions.

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiContext<Params, Query, Body> {
	params: Params;
	query: Query;
	body: Body;
	key: ApiKeyIdentity;
	/** The key as the actor of writes: revisions and the audit log name it. */
	actor: Actor;
	origin: AuditOrigin;
	request: Request;
}

export interface ApiResponse {
	/** Defaults to 200. */
	status?: number;
	/** Sent as JSON. */
	body?: unknown;
	/** A finished response, such as a file download; `body` is then ignored. */
	response?: Response;
	/** What a write changed, for the audit log. */
	target?: { type: string; id: string };
}

export interface ApiRouteResponse {
	status: number;
	description: string;
	/** The JSON body's shape; none for an empty or binary response. */
	schema?: z.ZodType;
	/** For binary responses, such as `image/*`. */
	contentType?: string;
}

export interface ApiRoute {
	method: HttpMethod;
	/** OpenAPI style, relative to /api/v1: `/notes/{id}`. */
	path: string;
	/** The scope a key needs; null for any valid key. */
	scope: string | null;
	/** Groups the route in the OpenAPI document, usually the module id. */
	tag: string;
	summary: string;
	description?: string;
	params?: z.ZodObject;
	query?: z.ZodObject;
	/** A JSON body. */
	body?: z.ZodType;
	/** A multipart body instead of JSON; the handler reads the form data from the request. */
	multipart?: { field: string; description: string };
	response: ApiRouteResponse;
	/** The audit log action of a write, such as `note.update`. */
	audit?: string;
	handler: (context: ApiContext<never, never, never>) => Promise<ApiResponse>;
}

type Output<T> = T extends z.ZodType ? z.output<T> : undefined;

/** Declares a route with its handler typed from its schemas. */
export function defineRoute<
	P extends z.ZodObject | undefined = undefined,
	Q extends z.ZodObject | undefined = undefined,
	B extends z.ZodType | undefined = undefined
>(
	route: Omit<ApiRoute, 'params' | 'query' | 'body' | 'handler'> & {
		params?: P;
		query?: Q;
		body?: B;
		handler: (context: ApiContext<Output<P>, Output<Q>, Output<B>>) => Promise<ApiResponse>;
	}
): ApiRoute {
	return route as unknown as ApiRoute;
}
