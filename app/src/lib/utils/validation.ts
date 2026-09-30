import type { FieldErrors, Validator } from '$lib/types/validation';
import type { z } from 'zod';

/** Lets client fields reuse the Zod schemas the server validates with. */
export function fromSchema(schema: z.ZodType): Validator {
	return (value) => {
		const result = schema.safeParse(value);
		if (result.success) {
			return null;
		}
		return result.error.issues[0]?.message ?? null;
	};
}

export function matches(other: () => string, message: () => string): Validator {
	return (value) => {
		if (value.length === 0 || value === other()) {
			return null;
		}
		return message();
	};
}

export function fieldErrors(error: z.ZodError): FieldErrors {
	const errors: FieldErrors = {};

	for (const issue of error.issues) {
		const key = String(issue.path[0] ?? '');
		if (key.length > 0 && errors[key] === undefined) {
			errors[key] = issue.message;
		}
	}
	return errors;
}

export function textValue(data: FormData, name: string): string {
	const value = data.get(name);
	if (typeof value !== 'string') {
		return '';
	}
	return value;
}
