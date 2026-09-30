import { m } from '$lib/paraglide/messages.js';
import { URL_MAX_LENGTH } from '$lib/schemas/rules';
import { z } from 'zod';

export const SECRET_NAME_MAX_LENGTH = 100;
export const SECRET_DESCRIPTION_MAX_LENGTH = 500;
/** Passwords, tokens and keys fit easily; a vault is not file storage. */
export const SECRET_VALUE_MAX_LENGTH = 10_000;

const optionalUrl = z
	.string()
	.trim()
	.max(URL_MAX_LENGTH, { error: () => m.validation_max_length({ max: URL_MAX_LENGTH }) })
	.refine((value) => value === '' || z.url({ protocol: /^https?$/ }).safeParse(value).success, {
		error: () => m.validation_service_url()
	})
	.transform((value) => (value === '' ? null : value));

const optionalDescription = z
	.string()
	.trim()
	.max(SECRET_DESCRIPTION_MAX_LENGTH, {
		error: () => m.validation_max_length({ max: SECRET_DESCRIPTION_MAX_LENGTH })
	})
	.transform((value) => (value === '' ? null : value));

export const secretNameSchema = z
	.string()
	.trim()
	.min(1, { error: () => m.validation_required() })
	.max(SECRET_NAME_MAX_LENGTH, {
		error: () => m.validation_max_length({ max: SECRET_NAME_MAX_LENGTH })
	});

export const secretValueSchema = z
	.string()
	.min(1, { error: () => m.validation_required() })
	.max(SECRET_VALUE_MAX_LENGTH, {
		error: () => m.validation_max_length({ max: SECRET_VALUE_MAX_LENGTH })
	});

export const secretMetadataSchema = z.object({
	name: secretNameSchema,
	serviceUrl: optionalUrl,
	description: optionalDescription
});

export const secretCreateSchema = secretMetadataSchema.extend({ value: secretValueSchema });
