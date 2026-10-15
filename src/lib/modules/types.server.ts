import type { CredentialProvider } from '$lib/server/api/credentials';
import type { ApiRoute } from '$lib/server/api/types';
import type { FileReference } from '$lib/server/files/files';
import type { HousekeepingTask } from '$lib/server/housekeeping';
import type { ApiKeyIdentity } from '$lib/server/api-keys';
import type { McpPrompt, McpTool } from '$lib/server/mcp/types';
import type { SearchProvider } from '$lib/server/search';
import type { DashboardCard } from '$lib/types/dashboard';
import type { FileUse } from '$lib/types/files';
import type { UsageItem } from '$lib/types/usage';
import type { SidebarGroup } from './types';

export interface ServerModuleManifest {
	id: string;
	/** Contents of the module's sidebar group, for group modules. */
	sidebarGroup?: () => Promise<SidebarGroup>;
	/** Columns that point at `file.id`, so housekeeping keeps those files. */
	fileReferences?: FileReference[];
	/** The places of the module that show these files, named and linked for the Files page. */
	fileUses?: (fileIds: string[]) => Promise<FileUse[]>;
	housekeeping?: HousekeepingTask[];
	/** REST routes under /api/v1. */
	api?: ApiRoute[];
	/** Answers the search and the command palette, with one provider per kind of hit. */
	search?: SearchProvider | SearchProvider[];
	/** Tools of the MCP server at /mcp. */
	mcp?: McpTool[];
	/** Prompts of the MCP server, for keys with `scope`, as the key reaches them. */
	mcpPrompts?: { scope: string; list: (key: ApiKeyIdentity) => Promise<McpPrompt[]> };
	/** What the module keeps, for the usage report: each kind of record, counted and sized. */
	usage?: () => Promise<UsageItem[]>;
	/** Tokens the module issues that authenticate on the API and MCP like API keys. */
	credentials?: CredentialProvider;
	/** The module's cards on the dashboard, in the order they are shown. */
	dashboard?: () => Promise<DashboardCard[]>;
}
