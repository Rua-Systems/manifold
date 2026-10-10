import { m } from '$lib/paraglide/messages.js';
import { z } from 'zod';
import type { FilesKindFilter, FilesSort } from './types';

export const FOLDER_NAME_MAX_LENGTH = 100;
export const FILE_NAME_MAX_LENGTH = 200;

// Slashes would read as a path in the breadcrumbs; control characters have no place in a name.
const PLAIN_NAME = /^[^/\\\p{Cc}]+$/u;

export const folderNameSchema = z
	.string()
	.trim()
	.min(1, { error: () => m.validation_required() })
	.max(FOLDER_NAME_MAX_LENGTH, {
		error: () => m.validation_max_length({ max: FOLDER_NAME_MAX_LENGTH })
	})
	.regex(PLAIN_NAME, { error: () => m.files_error_name_characters() });

export const fileNameSchema = z
	.string()
	.trim()
	.min(1, { error: () => m.validation_required() })
	.max(FILE_NAME_MAX_LENGTH, {
		error: () => m.validation_max_length({ max: FILE_NAME_MAX_LENGTH })
	})
	.regex(PLAIN_NAME, { error: () => m.files_error_name_characters() });

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
