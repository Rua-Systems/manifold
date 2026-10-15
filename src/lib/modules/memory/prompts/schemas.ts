import { m } from '$lib/paraglide/messages.js';
import { z } from 'zod';

// Rules for prompts, shared by the form, its actions and the API.

export const PROMPT_NAME_MAX_LENGTH = 60;
export const PROMPT_TITLE_MAX_LENGTH = 200;
export const PROMPT_DESCRIPTION_MAX_LENGTH = 1000;
export const PROMPT_BODY_MAX_LENGTH = 50_000;

/** Lower case letters and digits in words joined by single hyphens, such as `code-review`. */
const PROMPT_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const promptNameSchema = z
	.string()
	.trim()
	.min(1, { error: () => m.validation_required() })
	.max(PROMPT_NAME_MAX_LENGTH, {
		error: () => m.validation_max_length({ max: PROMPT_NAME_MAX_LENGTH })
	})
	.regex(PROMPT_NAME, { error: () => m.prompts_error_name() });

export const promptTitleSchema = z
	.string()
	.trim()
	.min(1, { error: () => m.validation_required() })
	.max(PROMPT_TITLE_MAX_LENGTH, {
		error: () => m.validation_max_length({ max: PROMPT_TITLE_MAX_LENGTH })
	});

export const promptDescriptionSchema = z
	.string()
	.trim()
	.max(PROMPT_DESCRIPTION_MAX_LENGTH, {
		error: () => m.validation_max_length({ max: PROMPT_DESCRIPTION_MAX_LENGTH })
	});

/** Kept as written, spaces and all: the text is handed over exactly. */
export const promptBodySchema = z
	.string()
	.refine((value) => value.trim().length > 0, { error: () => m.validation_required() })
	.refine((value) => value.length <= PROMPT_BODY_MAX_LENGTH, {
		error: () => m.validation_max_length({ max: PROMPT_BODY_MAX_LENGTH })
	});

export const promptFieldsSchema = z.object({
	name: promptNameSchema,
	title: promptTitleSchema,
	description: promptDescriptionSchema,
	body: promptBodySchema
});

/** A name made from a title: `Code Review!` becomes `code-review`. */
export function nameFromTitle(title: string): string {
	return title
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/ı/g, 'i')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, PROMPT_NAME_MAX_LENGTH)
		.replace(/-+$/g, '');
}
