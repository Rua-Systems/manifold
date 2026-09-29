import type { ApiRoute } from '$lib/server/api/types';
import type { FileReference } from '$lib/server/files/files';
import type { HousekeepingTask } from '$lib/server/housekeeping';
import type { SearchProvider } from '$lib/server/search';
import type { SidebarGroup } from './types';

export interface ServerModuleManifest {
	id: string;
	/** Contents of the module's sidebar group, for group modules. */
	sidebarGroup?: () => Promise<SidebarGroup>;
	/** Columns that point at `file.id`, so housekeeping keeps those files. */
	fileReferences?: FileReference[];
	housekeeping?: HousekeepingTask[];
	/** REST routes under /api/v1. */
	api?: ApiRoute[];
	/** Answers the search and the command palette. */
	search?: SearchProvider;
}
