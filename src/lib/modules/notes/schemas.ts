import { m } from '$lib/paraglide/messages.js';
import { isCalendarDate, VERSION_MAX } from '$lib/schemas/rules';
import { z } from 'zod';

export const NOTE_TITLE_MAX_LENGTH = 200;

export const noteTitleSchema = z
	.string()
	.trim()
	.max(NOTE_TITLE_MAX_LENGTH, {
		error: () => m.validation_max_length({ max: NOTE_TITLE_MAX_LENGTH })
	});

export const noteVersionSchema = z.coerce.number().int().min(1).max(VERSION_MAX);

export const NOTE_TOKEN_NAME_MAX_LENGTH = 100;

/** How long a new note token works unless the owner picks another day. */
export const NOTE_TOKEN_DEFAULT_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The day a new token's expiry field starts with, `YYYY-MM-DD` in UTC like the field itself. */
export function defaultNoteTokenExpiry(now = new Date()): string {
	return new Date(now.getTime() + NOTE_TOKEN_DEFAULT_DAYS * DAY_MS).toISOString().slice(0, 10);
}

/** The server also checks that the day lies ahead; this only shapes the input. */
export const noteTokenCreateSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, { error: () => m.validation_required() })
		.max(NOTE_TOKEN_NAME_MAX_LENGTH, {
			error: () => m.validation_max_length({ max: NOTE_TOKEN_NAME_MAX_LENGTH })
		}),
	access: z.enum(['read', 'edit'], { error: () => m.note_tokens_error_access() }),
	expires: z
		.string()
		.trim()
		.refine((value) => isCalendarDate(value), { error: () => m.note_tokens_error_expiry() })
});
