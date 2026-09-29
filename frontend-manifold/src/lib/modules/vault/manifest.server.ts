import type { ServerModuleManifest } from '../types.server';
import { vaultApiRoutes } from './api.server';
import { VAULT_MODULE } from './vault.server';

export const vaultServerManifest: ServerModuleManifest = {
	id: VAULT_MODULE,
	api: vaultApiRoutes
};
