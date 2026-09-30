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

/** A write was based on an older version than the stored one; `currentVersion` is the stored one. */
export class ConflictError extends Error {
	readonly currentVersion: number;

	constructor(currentVersion: number) {
		super('The record changed since it was loaded.');
		this.name = 'ConflictError';
		this.currentVersion = currentVersion;
	}
}
