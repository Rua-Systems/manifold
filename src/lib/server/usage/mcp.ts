import { z } from 'zod';
import { callRoute, findRoute } from '../mcp/routes';
import { defineTool, type McpTool } from '../mcp/types';
import { usageApiRoutes } from './api';

export const usageMcpTools: McpTool[] = [
	defineTool({
		name: 'get_usage',
		title: 'Report usage',
		scope: 'usage:read',
		description:
			'Reports what the app keeps and the resources it uses, measured now: for each module the count and stored size of its records (notes, trash, revisions, map features, services, vault entries), the audit log, API keys and sessions; uploaded files by owner; the database size and its tables with row counts; the upload directory with the free space of its disk; and the server process (version, uptime, memory, processor time). Sizes are bytes. Needs the usage:read scope.',
		input: z.object({}),
		handler: async (_args, context) => {
			const result = await callRoute(findRoute(usageApiRoutes, 'GET', '/usage'), {}, context);
			return { data: result.body };
		}
	})
];
