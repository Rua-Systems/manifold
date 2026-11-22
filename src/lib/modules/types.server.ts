import type { CredentialProvider } from '#lib/server/api/credentials.ts';
import type { ApiRoute } from '#lib/server/api/types.ts';
import type { FileReference } from '#lib/server/files/files.ts';
import type { HousekeepingTask } from '#lib/server/housekeeping.ts';
import type { ApiKeyIdentity } from '#lib/server/api-keys.ts';
import type { McpPrompt, McpTool } from '#lib/server/mcp/types.ts';
import type { SearchProvider } from '#lib/server/search.ts';
import type { DashboardCard } from '#lib/types/dashboard.ts';
import type { FileUse } from '#lib/types/files.ts';
import type { UsageItem } from '#lib/types/usage.ts';
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
