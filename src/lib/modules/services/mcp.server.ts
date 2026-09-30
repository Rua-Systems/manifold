import { callRoute, findRoute } from '$lib/server/mcp/routes';
import { defineTool, type McpTool } from '$lib/server/mcp/types';
import { z } from 'zod';
import { servicesApiRoutes } from './api.server';

// MCP tools for services, running the /api/v1/services handlers.

const serviceId = z.string().describe('The service id, a UUID as returned by list_services.');

const route = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string) =>
	findRoute(servicesApiRoutes, method, path);

export const servicesMcpTools: McpTool[] = [
	defineTool({
		name: 'list_services',
		title: 'List services',
		scope: 'services:read',
		description:
			'Lists the services the owner keeps links to, in their sidebar order: id, alias, url, icon_url, position. Page with `cursor` from `next_cursor`. Needs the services:read scope.',
		input: z.object({
			limit: z.number().int().min(1).max(100).optional(),
			cursor: z.string().optional()
		}),
		handler: async (args, context) => {
			const result = await callRoute(route('GET', '/services'), { query: args }, context);
			return { data: result.body };
		}
	}),
	defineTool({
		name: 'create_service',
		title: 'Add a service',
		scope: 'services:write',
		description:
			'Adds a service at the end of the list. The url must start with http:// or https://. Needs the services:write scope.',
		input: z.object({
			alias: z.string().max(60).describe('The name shown in the sidebar.'),
			url: z.string().describe('An http or https address.')
		}),
		audit: 'service.create',
		handler: async (args, context) => {
			const result = await callRoute(route('POST', '/services'), { body: args }, context);
			return { data: result.body, target: result.target };
		}
	}),
	defineTool({
		name: 'update_service',
		title: 'Change a service',
		scope: 'services:write',
		description:
			'Changes the alias, the url, or both, of a service; what is left out stays. Needs the services:write scope.',
		input: z.object({
			id: serviceId,
			alias: z.string().max(60).optional(),
			url: z.string().optional()
		}),
		audit: 'service.update',
		handler: async (args, context) => {
			const { id, ...body } = args;
			const result = await callRoute(
				route('PATCH', '/services/{id}'),
				{ params: { id }, body },
				context
			);
			return { data: result.body, target: result.target };
		}
	}),
	defineTool({
		name: 'delete_service',
		title: 'Delete a service',
		scope: 'services:write',
		description:
			'Removes a service and its icon. It cannot be undone. Needs the services:write scope.',
		input: z.object({ id: serviceId }),
		audit: 'service.delete',
		handler: async (args, context) => {
			const result = await callRoute(
				route('DELETE', '/services/{id}'),
				{ params: args },
				context
			);
			return { data: { id: args.id, deleted: true }, target: result.target };
		}
	})
];
