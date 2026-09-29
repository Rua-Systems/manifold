import type { ServerModuleManifest } from '../types.server';
import { vaultApiRoutes } from './api.server';
import { vaultMcpTools } from './mcp.server';
import { searchSecrets, VAULT_MODULE } from './vault.server';

export const vaultServerManifest: ServerModuleManifest = {
	id: VAULT_MODULE,
	api: vaultApiRoutes,
	mcp: vaultMcpTools,
	// Names only: a hit leads to the vault page, where values still need a step-up.
	search: {
		type: 'secret',
		scope: 'vault:read',
		search: async (query, limit) =>
			(await searchSecrets(query, limit)).map((secret) => ({
				type: 'secret',
				id: secret.id,
				title: secret.name,
				snippet: secret.serviceUrl ?? secret.description ?? '',
				href: '/vault',
				external: false,
				score: secret.score
			}))
	}
};
