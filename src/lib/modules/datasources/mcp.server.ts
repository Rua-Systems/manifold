import { callRoute, findRoute } from '$lib/server/mcp/routes';
import { defineTool, type McpTool } from '$lib/server/mcp/types';
import { z } from 'zod';
import { dataSourcesApiRoutes } from './api.server';
import { DATA_SOURCE_TYPES } from './types';

// MCP tools for data sources, running the /api/v1/data-sources handlers. Agents find where a
// database, an API or a bucket is, and with datasources:secrets also how to get in.

const sourceId = z
	.string()
	.describe('The data source id, a UUID as returned by list_data_sources.');

const route = (method: 'GET' | 'POST', path: string) =>
	findRoute(dataSourcesApiRoutes, method, path);

export const dataSourcesMcpTools: McpTool[] = [
	defineTool({
		name: 'list_data_sources',
		title: 'List data sources',
		scope: 'datasources:read',
		description:
			"Lists the owner's data sources by name: databases (PostgreSQL, MySQL, Redis), S3 buckets, HTTP APIs and links, each with its settings (host, port, database, user, address, bucket and so on), its description, a documentation link, which secrets are stored (never their values) and the last connection test. Pass `type` or `query` to narrow the list. Read the secrets with get_data_source_secrets. Needs the datasources:read scope.",
		input: z.object({
			type: z.enum(DATA_SOURCE_TYPES).optional().describe('Only sources of this type.'),
			query: z
				.string()
				.max(200)
				.optional()
				.describe('Words in the name, the description or the settings.')
		}),
		handler: async (args, context) => {
			const result = await callRoute(
				route('GET', '/data-sources'),
				{ query: { type: args.type, q: args.query } },
				context
			);
			return { data: result.body };
		}
	}),
	defineTool({
		name: 'get_data_source',
		title: 'Read a data source',
		scope: 'datasources:read',
		description:
			'Reads one data source with its settings, description, documentation link, the names of its stored secrets and its last connection test. The description often says how to connect when there is no documentation. Needs the datasources:read scope.',
		input: z.object({ id: sourceId }),
		handler: async (args, context) => {
			const result = await callRoute(
				route('GET', '/data-sources/{id}'),
				{ params: { id: args.id } },
				context
			);
			return { data: result.body };
		}
	}),
	defineTool({
		name: 'get_data_source_secrets',
		title: "Read a data source's secrets",
		scope: 'datasources:secrets',
		description:
			"Reads the passwords, tokens and keys of one data source, and its connection URL (such as postgresql://user:password@host:5432/db) where the type has one. Use them only to connect to that source, and never repeat them in answers. Every read is recorded in the owner's audit log. Needs the datasources:secrets scope.",
		input: z.object({ id: sourceId }),
		audit: 'data_source.reveal',
		handler: async (args, context) => {
			const result = await callRoute(
				route('GET', '/data-sources/{id}/secrets'),
				{ params: { id: args.id } },
				context
			);
			return { data: result.body, target: result.target };
		}
	}),
	defineTool({
		name: 'test_data_source',
		title: 'Test a data source',
		scope: 'datasources:write',
		description:
			'Has the server connect to a data source with its stored settings and secrets, read something harmless such as the server version, and close. Nothing is written to the source. Answers `ok`, a `message` with what was found or why it failed, and `duration_ms`; the outcome is kept as the last test. Needs the datasources:write scope.',
		input: z.object({ id: sourceId }),
		audit: 'data_source.test',
		handler: async (args, context) => {
			const result = await callRoute(
				route('POST', '/data-sources/{id}/test'),
				{ params: { id: args.id } },
				context
			);
			return { data: result.body, target: result.target };
		}
	})
];
