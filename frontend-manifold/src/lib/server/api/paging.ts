import { z } from 'zod';
import { ApiError } from './errors';

// Cursor paging for every list: `limit` up to 100 and an opaque `cursor` from the previous page.

export const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;

export const pageQuery = z.object({
	limit: z.coerce
		.number()
		.int()
		.min(1)
		.max(MAX_PAGE_SIZE)
		.default(DEFAULT_PAGE_SIZE)
		.meta({
			description: `Items per page, at most ${MAX_PAGE_SIZE}.`
		}),
	cursor: z.string().max(1000).optional().meta({
		description: 'The `next_cursor` of the previous page.'
	})
});

export function encodeCursor(position: unknown): string {
	return Buffer.from(JSON.stringify(position)).toString('base64url');
}

export function decodeCursor<T>(cursor: string, schema: z.ZodType<T>): T {
	try {
		return schema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
	} catch {
		throw new ApiError(400, 'invalid_cursor', 'The cursor is not valid.');
	}
}

/** Takes one item more than the page, to know whether another page follows. */
export function pageOf<T>(
	rows: T[],
	limit: number,
	positionOf: (last: T) => unknown
): { data: T[]; nextCursor: string | null } {
	if (rows.length <= limit) {
		return { data: rows, nextCursor: null };
	}
	const data = rows.slice(0, limit);
	return { data, nextCursor: encodeCursor(positionOf(data[data.length - 1])) };
}

export function pageSchema(item: z.ZodType) {
	return z.object({
		data: z.array(item),
		next_cursor: z.string().nullable().meta({ description: 'Null on the last page.' })
	});
}
