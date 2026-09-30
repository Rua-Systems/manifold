import { m } from '$lib/paraglide/messages.js';
import { URL_MAX_LENGTH } from '$lib/schemas/rules';
import { z } from 'zod';

export const SERVICE_ALIAS_MAX_LENGTH = 60;

export const serviceAliasSchema = z
	.string()
	.trim()
	.min(1, { error: () => m.validation_required() })
	.max(SERVICE_ALIAS_MAX_LENGTH, {
		error: () => m.validation_max_length({ max: SERVICE_ALIAS_MAX_LENGTH })
	});

/** Only http and https: anything else (javascript:, data:, file:) could run or leak on click. */
export const serviceUrlSchema = z
	.string()
	.trim()
	.min(1, { error: () => m.validation_required() })
	.max(URL_MAX_LENGTH, { error: () => m.validation_max_length({ max: URL_MAX_LENGTH }) })
	.pipe(z.url({ protocol: /^https?$/, error: () => m.validation_service_url() }));

export const serviceSchema = z.object({
	alias: serviceAliasSchema,
	url: serviceUrlSchema
});

export type ServiceInput = z.infer<typeof serviceSchema>;
