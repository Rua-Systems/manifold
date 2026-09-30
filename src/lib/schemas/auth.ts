import { m } from '$lib/paraglide/messages.js';
import { z } from 'zod';
import {
	CODE_LENGTH,
	DISPLAY_NAME_MAX_LENGTH,
	isValidUsername,
	PASSWORD_MAX_LENGTH,
	PASSWORD_MIN_LENGTH,
	USERNAME_MAX_LENGTH,
	USERNAME_MIN_LENGTH
} from './rules';

export { CODE_LENGTH, PASSWORD_MIN_LENGTH };

const CODE_PATTERN = new RegExp(`^\\d{${CODE_LENGTH}}$`);

function required() {
	return { error: () => m.validation_required() };
}

export const emailSchema = z
	.string()
	.trim()
	.min(1, required())
	.pipe(z.email({ error: () => m.validation_email() }));

export const usernameSchema = z
	.string()
	.trim()
	.min(1, required())
	.refine(isValidUsername, {
		error: () => m.validation_username({ min: USERNAME_MIN_LENGTH, max: USERNAME_MAX_LENGTH })
	});

/** Sign in accepts a username or an email address in one field. Usernames match case insensitively. */
export const identifierSchema = z
	.string()
	.trim()
	.min(1, required())
	.refine((value) => value.includes('@') || isValidUsername(value.toLowerCase()), {
		error: () => m.validation_identifier()
	})
	.refine((value) => !value.includes('@') || z.email().safeParse(value).success, {
		error: () => m.validation_identifier()
	});

export const passwordSchema = z.string().min(1, required());

export const newPasswordSchema = z
	.string()
	.min(1, required())
	.min(PASSWORD_MIN_LENGTH, {
		error: () => m.validation_min_length({ min: PASSWORD_MIN_LENGTH })
	})
	.max(PASSWORD_MAX_LENGTH, {
		error: () => m.validation_max_length({ max: PASSWORD_MAX_LENGTH })
	});

export const displayNameSchema = z
	.string()
	.trim()
	.min(1, required())
	.max(DISPLAY_NAME_MAX_LENGTH, {
		error: () => m.validation_max_length({ max: DISPLAY_NAME_MAX_LENGTH })
	});

export const codeSchema = z
	.string()
	.trim()
	.min(1, required())
	.regex(CODE_PATTERN, { error: () => m.validation_code({ length: CODE_LENGTH }) });

/** Backup codes are ten letters and digits with a dash in the middle; the length is left loose. */
export const backupCodeSchema = z
	.string()
	.trim()
	.min(1, required())
	.max(32, { error: () => m.validation_max_length({ max: 32 }) });

export const passwordLoginSchema = z.object({
	identifier: identifierSchema,
	password: passwordSchema
});

export const codeRequestSchema = z.object({
	email: emailSchema
});

export const codeLoginSchema = z.object({
	email: emailSchema,
	code: codeSchema
});

function passwordsMatch(data: { password: string; confirmPassword: string }): boolean {
	return data.password === data.confirmPassword;
}

const mismatch = {
	error: () => m.validation_password_mismatch(),
	path: ['confirmPassword']
};

export const passwordResetSchema = z
	.object({
		email: emailSchema,
		code: codeSchema,
		password: newPasswordSchema,
		confirmPassword: z.string()
	})
	.refine(passwordsMatch, mismatch);

export const profileSchema = z.object({
	name: displayNameSchema,
	username: usernameSchema
});

export const emailChangeSchema = z.object({
	email: emailSchema
});

export const passwordChangeSchema = z
	.object({
		currentPassword: passwordSchema,
		password: newPasswordSchema,
		confirmPassword: z.string()
	})
	.refine(passwordsMatch, mismatch);
