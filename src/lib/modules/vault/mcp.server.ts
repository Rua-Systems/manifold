import { callRoute, findRoute } from '$lib/server/mcp/routes';
import { defineTool, type McpTool } from '$lib/server/mcp/types';
import { z } from 'zod';
import { vaultApiRoutes } from './api.server';

// The vault's one MCP tool: names and notes only. No tool reads or writes a value.

export const vaultMcpTools: McpTool[] = [
	defineTool({
		name: 'list_vault_secrets',
		title: 'List vault entries',
		scope: 'vault:read',
		description:
			'Lists what the vault holds, by name: id, name, service_url, description, api_key_id (set on the copy of an API key) and timestamps. Values are never available to tools or the API; the owner reveals them in the app. Useful to tell whether a credential for a service exists. Needs the vault:read scope.',
		input: z.object({
			limit: z.number().int().min(1).max(100).optional(),
			cursor: z.string().optional()
		}),
		handler: async (args, context) => {
			const result = await callRoute(
				findRoute(vaultApiRoutes, 'GET', '/vault/secrets'),
				{ query: args },
				context
			);
			return { data: result.body };
		}
	})
];
