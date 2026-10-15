import { m } from '$lib/paraglide/messages.js';
import { measureRows } from '$lib/server/usage/measure';
import type { ServerModuleManifest } from '../types.server';
import { dataSourcesApiRoutes } from './api.server';
import { DATASOURCES_MODULE, searchDataSources } from './datasources.server';
import { TYPE_LABELS } from './labels';
import { dataSourcesMcpTools } from './mcp.server';
import { dataSource } from './schema.server';

export const dataSourcesServerManifest: ServerModuleManifest = {
	id: DATASOURCES_MODULE,
	api: dataSourcesApiRoutes,
	mcp: dataSourcesMcpTools,
	// Names only: a hit leads to the source's page, where secrets still need a step-up.
	search: {
		type: 'data_source',
		scope: 'datasources:read',
		search: async (query, limit) =>
			(await searchDataSources(query, limit)).map((source) => ({
				type: 'data_source',
				id: source.id,
				title: source.name,
				snippet: source.description || TYPE_LABELS[source.type](),
				href: `/data-sources/${source.id}`,
				external: false,
				score: source.score
			}))
	},
	usage: async () => [
		{
			id: 'datasources.sources',
			label: m.usage_data_sources(),
			...(await measureRows(dataSource))
		}
	]
};
