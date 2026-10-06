import { m } from '$lib/paraglide/messages.js';
import { z } from 'zod';
import { codeSchema, passwordSchema } from './auth';
import { isCalendarDate } from './rules';

/** The password and a current TOTP code, for turning two factor off or new backup codes. */
export const twoFactorCredentialsSchema = z.object({
	password: passwordSchema,
	code: codeSchema
});

/** The code is only checked when two factor authentication is on. */
export const stepUpSchema = z.object({
	password: passwordSchema,
	code: z.string().trim().max(32)
});

export const preferencesSchema = z.object({
	locale: z.enum(['', 'en', 'tr'], { error: () => m.validation_required() }),
	theme: z.enum(['', 'light', 'dark'], { error: () => m.validation_required() })
});

/** The audit log's filters, read from the address; anything malformed is ignored. */
export const auditFilterSchema = z.object({
	actor: z.enum(['owner', 'api_key', 'note_token', 'cli', 'system']).optional().catch(undefined),
	action: z.string().trim().max(100).optional().catch(undefined),
	from: z.string().refine(isCalendarDate).optional().catch(undefined),
	to: z.string().refine(isCalendarDate).optional().catch(undefined),
	page: z.coerce.number().int().min(1).max(100_000).optional().catch(undefined)
});
