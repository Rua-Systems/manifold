import type { ApiRoute } from '$lib/server/api/types';
import type { FileReference } from '$lib/server/files/files';
import type { McpTool } from '$lib/server/mcp/types';
import type { HousekeepingTask } from '$lib/server/housekeeping';
import type { DashboardCard } from '$lib/types/dashboard';
import type { UsageItem } from '$lib/types/usage';
import { MODULES } from './registry';
import { notesServerManifest } from './notes/manifest.server';
import { servicesServerManifest } from './services/manifest.server';
import { vaultServerManifest } from './vault/manifest.server';
import type { SidebarData } from './types';
import type { ServerModuleManifest } from './types.server';

/** The server half of every module in registry.ts, in any order; ids must match. */
export const SERVER_MODULES: readonly ServerModuleManifest[] = [
	servicesServerManifest,
	notesServerManifest,
	vaultServerManifest
];

export async function loadSidebar(): Promise<SidebarData> {
	const entries = await Promise.all(
		SERVER_MODULES.filter((module) => module.sidebarGroup !== undefined).map(
			async (module) => [module.id, await module.sidebarGroup?.()] as const
		)
	);

	const data: SidebarData = {};
	for (const [id, group] of entries) {
		if (group !== undefined) {
			data[id] = group;
		}
	}
	return data;
}

export function fileReferences(): FileReference[] {
	return SERVER_MODULES.flatMap((module) => module.fileReferences ?? []);
}

export function moduleHousekeeping(): HousekeepingTask[] {
	return SERVER_MODULES.flatMap((module) => module.housekeeping ?? []);
}

export function moduleApiRoutes(): ApiRoute[] {
	return SERVER_MODULES.flatMap((module) => module.api ?? []);
}

export function moduleMcpTools(): McpTool[] {
	return SERVER_MODULES.flatMap((module) => module.mcp ?? []);
}

/** The dashboard cards of every module that has some, in sidebar order. */
export async function moduleDashboardCards(): Promise<DashboardCard[]> {
	const byModule = new Map(
		await Promise.all(
			SERVER_MODULES.map(
				async (module) => [module.id, (await module.dashboard?.()) ?? []] as const
			)
		)
	);
	return MODULES.flatMap((module) => byModule.get(module.id) ?? []);
}

/** The usage of every module that reports one, by module id. */
export async function moduleUsage(): Promise<Map<string, UsageItem[]>> {
	const entries = await Promise.all(
		SERVER_MODULES.map(async (module) => {
			if (module.usage === undefined) {
				return null;
			}
			return [module.id, await module.usage()] as const;
		})
	);
	return new Map(entries.filter((entry) => entry !== null));
}
