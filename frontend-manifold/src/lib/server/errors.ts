import type { FieldErrors } from '$lib/types/validation';

/** Input that failed validation; `fields` maps field names to messages for the form or the API. */
export class ValidationError extends Error {
	readonly fields: FieldErrors;

	constructor(fields: FieldErrors) {
		super('The input is not valid.');
		this.name = 'ValidationError';
		this.fields = fields;
	}
}

export class NotFoundError extends Error {
	constructor(what: string) {
		super(`${what} was not found.`);
		this.name = 'NotFoundError';
	}
}
