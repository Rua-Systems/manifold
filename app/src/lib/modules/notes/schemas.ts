import { m } from '$lib/paraglide/messages.js';
import { z } from 'zod';

export const NOTE_TITLE_MAX_LENGTH = 200;

export const noteTitleSchema = z
	.string()
	.trim()
	.max(NOTE_TITLE_MAX_LENGTH, {
		error: () => m.validation_max_length({ max: NOTE_TITLE_MAX_LENGTH })
	});

export const noteVersionSchema = z.coerce.number().int().min(1);
