import { m } from '$lib/paraglide/messages.js';
import { z } from 'zod';

export const CODE_LENGTH = 6;

export const PASSWORD_MIN_LENGTH = 8;

const CODE_PATTERN = new RegExp(`^\\d{${CODE_LENGTH}}$`);

export const emailSchema = z
	.string()
	.trim()
	.min(1, { error: () => m.validation_required() })
	.pipe(z.email({ error: () => m.validation_email() }));

export const passwordSchema = z.string().min(1, { error: () => m.validation_required() });

export const newPasswordSchema = z
	.string()
	.min(1, { error: () => m.validation_required() })
	.min(PASSWORD_MIN_LENGTH, {
		error: () => m.validation_min_length({ min: PASSWORD_MIN_LENGTH })
	});

export const codeSchema = z
	.string()
	.trim()
	.min(1, { error: () => m.validation_required() })
	.regex(CODE_PATTERN, { error: () => m.validation_code({ length: CODE_LENGTH }) });

export const passwordLoginSchema = z.object({
	email: emailSchema,
	password: passwordSchema
});

export const codeRequestSchema = z.object({
	email: emailSchema
});

export const codeLoginSchema = z.object({
	email: emailSchema,
	code: codeSchema
});

export const passwordResetSchema = z
	.object({
		email: emailSchema,
		code: codeSchema,
		password: newPasswordSchema,
		confirmPassword: z.string()
	})
	.refine((data) => data.password === data.confirmPassword, {
		error: () => m.validation_password_mismatch(),
		path: ['confirmPassword']
	});
