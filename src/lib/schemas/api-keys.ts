import { m } from '$lib/paraglide/messages.js';
import { isCalendarDate } from './rules';
import { z } from 'zod';

export const API_KEY_NAME_MAX_LENGTH = 100;

/** Scopes are checked against the registry on the server; this only shapes the input. */
export const apiKeyCreateSchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, { error: () => m.validation_required() })
		.max(API_KEY_NAME_MAX_LENGTH, {
			error: () => m.validation_max_length({ max: API_KEY_NAME_MAX_LENGTH })
		}),
	scopes: z.array(z.string()).min(1, { error: () => m.api_keys_error_scopes() }),
	expires: z
		.string()
		.trim()
		.refine((value) => value === '' || isCalendarDate(value), {
			error: () => m.api_keys_error_expiry()
		})
});
