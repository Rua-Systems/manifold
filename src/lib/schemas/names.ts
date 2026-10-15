import { m } from '$lib/paraglide/messages.js';
import { z } from 'zod';

// Names the owner gives to folders and files. They show in breadcrumbs and lists, so slashes would
// read as a path, and control characters have no place in them.

export const FOLDER_NAME_MAX_LENGTH = 100;

const PLAIN_NAME = /^[^/\\\p{Cc}]+$/u;

/** A trimmed name of 1 to `max` characters with no slashes or control characters. */
export function plainNameSchema(max: number) {
	return z
		.string()
		.trim()
		.min(1, { error: () => m.validation_required() })
		.max(max, { error: () => m.validation_max_length({ max }) })
		.regex(PLAIN_NAME, { error: () => m.validation_plain_name() });
}

/** The name of a folder, of files or of notes. */
export const folderNameSchema = plainNameSchema(FOLDER_NAME_MAX_LENGTH);
