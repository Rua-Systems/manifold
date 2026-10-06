import { version } from '$app/environment';
import { moduleApiRoutes } from '$lib/modules/registry.server';
import { z } from 'zod';
import { getEnv } from '../env';
import { usageApiRoutes } from '../usage/api';
import { CORE_ROUTES } from './core-routes';
import { buildOpenApiDocument } from './openapi';
import { defineRoute, type ApiRoute } from './types';

export const API_BASE_PATH = '/api/v1';

const openApiRoute = defineRoute({
	method: 'GET',
	path: '/openapi.json',
	scope: null,
	tag: 'key',
	summary: 'This document',
	response: {
		status: 200,
		description: 'The OpenAPI 3.1 document of this API.',
		schema: z.object({ openapi: z.string() }).loose()
	},
	handler: async () => ({ body: openApiDocument() })
});

/**
 * Every route under /api/v1: the core's, the usage report, the modules' from the registry, and
 * the document.
 */
export function apiRoutes(): ApiRoute[] {
	return [...CORE_ROUTES, ...usageApiRoutes, ...moduleApiRoutes(), openApiRoute];
}

export function openApiDocument(): Record<string, unknown> {
	const env = getEnv();
	return buildOpenApiDocument(apiRoutes(), {
		title: `${env.ORGANIZATION_NAME} API`,
		version,
		serverUrl: `${env.ORIGIN}${API_BASE_PATH}`
	});
}
