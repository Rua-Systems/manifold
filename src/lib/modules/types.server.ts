import type { CredentialProvider } from '$lib/server/api/credentials';
import type { ApiRoute } from '$lib/server/api/types';
import type { FileReference } from '$lib/server/files/files';
import type { HousekeepingTask } from '$lib/server/housekeeping';
import type { McpTool } from '$lib/server/mcp/types';
import type { SearchProvider } from '$lib/server/search';
import type { UsageItem } from '$lib/types/usage';
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
	/** Tools of the MCP server at /mcp. */
	mcp?: McpTool[];
	/** What the module keeps, for the usage report: each kind of record, counted and sized. */
	usage?: () => Promise<UsageItem[]>;
	/** Tokens the module issues that authenticate on the API and MCP like API keys. */
	credentials?: CredentialProvider;
}
