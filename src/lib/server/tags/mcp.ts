import { z } from 'zod';
import { defineTool, type McpTool } from '../mcp/types';
import { toTagResource } from './api';
import { listTags } from './tags';

export const tagsMcpTools: McpTool[] = [
	defineTool({
		name: 'list_tags',
		title: 'List tags',
		scope: null,
		description:
			'Lists every global tag of the owner by name, each with its color. Tools that file records under tags take these names, in any case; a name not in this list is refused, because only the owner makes tags. Needs no particular scope.',
		input: z.object({}),
		// All of them at once rather than the API's pages: an agent needs the whole list to choose.
		handler: async () => ({ data: { data: (await listTags()).map(toTagResource) } })
	})
];
