import { originOf } from '#lib/server/audit.ts';
import { handleMcpRequest } from '#lib/server/mcp/server.ts';
import type { RequestHandler } from './$types';

// The MCP server. Stateless streamable HTTP: clients POST JSON-RPC messages with an API key.
const handle: RequestHandler = (event) =>
	handleMcpRequest(event.request, { origin: originOf(event) });

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
