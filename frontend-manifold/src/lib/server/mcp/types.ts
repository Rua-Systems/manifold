import type { z } from 'zod';
import type { Actor } from '../actor';
import type { ApiKeyIdentity } from '../api-keys';
import type { AuditOrigin } from '../audit';

// An MCP tool. Modules list theirs in their server manifest; /mcp offers a key only the tools
// its scopes allow.

export interface McpContext {
	key: ApiKeyIdentity;
	actor: Actor;
	origin: AuditOrigin;
}

export interface McpToolResult {
	/** Sent to the client as JSON text. */
	data: unknown;
	/** What a write changed, for the audit log. */
	target?: { type: string; id: string };
}

export interface McpTool {
	/** snake_case, such as `update_note`. */
	name: string;
	title: string;
	/** Written for AI agents: what the tool does, what it needs, what can go wrong. */
	description: string;
	/** The scope a key needs to see and call the tool; null for any key. */
	scope: string | null;
	input: z.ZodObject;
	/** The audit log action of a write. */
	audit?: string;
	handler: (args: never, context: McpContext) => Promise<McpToolResult>;
}

/** Declares a tool with its handler typed from its input schema. */
export function defineTool<I extends z.ZodObject>(
	tool: Omit<McpTool, 'input' | 'handler'> & {
		input: I;
		handler: (args: z.output<I>, context: McpContext) => Promise<McpToolResult>;
	}
): McpTool {
	return tool as unknown as McpTool;
}
