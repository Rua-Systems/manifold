import { m } from '$lib/paraglide/messages.js';
import { TAG_COLORS } from '$lib/types/tags';
import { z } from 'zod';
import { plainNameSchema } from './names';

// Rules for global tags, shared by the settings form, its actions and the modules that take tag
// names from the API.

export const TAG_NAME_MAX_LENGTH = 40;

/** At most this many tags on one record. */
export const TAGS_PER_RECORD_MAX = 20;

export const tagNameSchema = plainNameSchema(TAG_NAME_MAX_LENGTH);

export const tagColorSchema = z.enum(TAG_COLORS, { error: () => m.tags_error_color() });

export const tagSchema = z.object({
	name: tagNameSchema,
	color: tagColorSchema
});

export type TagInput = z.infer<typeof tagSchema>;
