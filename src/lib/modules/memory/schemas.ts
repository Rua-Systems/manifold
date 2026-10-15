import { m } from '$lib/paraglide/messages.js';
import { plainNameSchema } from '$lib/schemas/names';
import { VERSION_MAX } from '$lib/schemas/rules';
import { z } from 'zod';

// Rules for memories and their categories, shared by the forms, their actions and the API.

export const MEMORY_TITLE_MAX_LENGTH = 200;

export const MEMORY_CATEGORY_NAME_MAX_LENGTH = 60;

/** A memory needs a title: agents choose what to read by it. */
export const memoryTitleSchema = z
	.string()
	.trim()
	.min(1, { error: () => m.validation_required() })
	.max(MEMORY_TITLE_MAX_LENGTH, {
		error: () => m.validation_max_length({ max: MEMORY_TITLE_MAX_LENGTH })
	});

export const memoryCategoryNameSchema = plainNameSchema(MEMORY_CATEGORY_NAME_MAX_LENGTH);

export const memoryVersionSchema = z.coerce.number().int().min(1).max(VERSION_MAX);
