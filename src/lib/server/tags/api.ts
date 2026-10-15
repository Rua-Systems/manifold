import { TAG_COLORS, type Tag } from '$lib/types/tags';
import { z } from 'zod';
import { decodeCursor, pageOf, pageQuery, pageSchema } from '../api/paging';
import { defineRoute, type ApiRoute } from '../api/types';
import { listTags } from './tags';

// /api/v1/tags: the owner's global tags, read only. Tags are made in Settings → Tags; records take
// them by name through their own module's routes.

export const tagResource = z.object({
	id: z.string(),
	name: z.string(),
	color: z.enum(TAG_COLORS)
});

export function toTagResource(tag: Tag): z.output<typeof tagResource> {
	return { id: tag.id, name: tag.name, color: tag.color };
}

const offsetCursor = z.object({ o: z.number().int().min(0) });

export const tagsApiRoutes: ApiRoute[] = [
	defineRoute({
		method: 'GET',
		path: '/tags',
		// Tag names say what the owner files things under, not what is in them.
		scope: null,
		tag: 'tags',
		summary: 'List tags by name',
		description:
			'The global tags kept in Settings → Tags. Records that take tags name them; a name that is not listed here is refused, since only the owner makes tags.',
		query: pageQuery,
		response: { status: 200, description: 'A page of tags.', schema: pageSchema(tagResource) },
		handler: async ({ query }) => {
			let offset = 0;
			if (query.cursor !== undefined) {
				offset = decodeCursor(query.cursor, offsetCursor).o;
			}
			const rows = (await listTags()).slice(offset, offset + query.limit + 1);
			const page = pageOf(rows, query.limit, () => ({ o: offset + query.limit }));
			return { body: { data: page.data.map(toTagResource), next_cursor: page.nextCursor } };
		}
	})
];
