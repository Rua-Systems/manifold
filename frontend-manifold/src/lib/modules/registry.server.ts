import type { ApiRoute } from '$lib/server/api/types';
import type { FileReference } from '$lib/server/files/files';
import type { HousekeepingTask } from '$lib/server/housekeeping';
import { notesServerManifest } from './notes/manifest.server';
import { servicesServerManifest } from './services/manifest.server';
import type { SidebarData } from './types';
import type { ServerModuleManifest } from './types.server';

/** The server half of every module in registry.ts, in any order; ids must match. */
export const SERVER_MODULES: readonly ServerModuleManifest[] = [
	servicesServerManifest,
	notesServerManifest
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
