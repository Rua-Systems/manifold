import { FOLDER_NAME_MAX_LENGTH, folderNameSchema, plainNameSchema } from '$lib/schemas/names';
import type { FilesKindFilter, FilesSort } from './types';

export { FOLDER_NAME_MAX_LENGTH, folderNameSchema };

export const FILE_NAME_MAX_LENGTH = 200;

export const fileNameSchema = plainNameSchema(FILE_NAME_MAX_LENGTH);

const SORTS: readonly FilesSort[] = ['newest', 'oldest', 'name', 'size'];
const KINDS: readonly FilesKindFilter[] = [
	'all',
	'image',
	'pdf',
	'audio',
	'video',
	'text',
	'other'
];

/** The sort of an address, `newest` for anything unknown. */
export function parseSort(value: string | null): FilesSort {
	return SORTS.find((sort) => sort === value) ?? 'newest';
}

/** The kind filter of an address, `all` for anything unknown. */
export function parseKind(value: string | null): FilesKindFilter {
	return KINDS.find((kind) => kind === value) ?? 'all';
}
