import type { FieldErrors } from '$lib/types/validation';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { FileRejectedError, type FileRejection } from '../files/files';

// Every API error has the same body: `{ "error": { "code", "message", ... } }`. Messages are for
// developers and stay in English.

export class ApiError extends Error {
	readonly status: number;
	readonly code: string;
	readonly details: Record<string, unknown>;

	constructor(
		status: number,
		code: string,
		message: string,
		details: Record<string, unknown> = {}
	) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.code = code;
		this.details = details;
	}
}

export function invalidRequest(fields: FieldErrors): ApiError {
	return new ApiError(400, 'invalid_request', 'The request is not valid.', { fields });
}

/** Turns a module's error into the API error it stands for, or null for an unexpected one. */
export function apiErrorFrom(cause: unknown): ApiError | null {
	if (cause instanceof ApiError) {
		return cause;
	}
	if (cause instanceof ValidationError) {
		return new ApiError(422, 'validation_failed', 'The input was not accepted.', {
			fields: cause.fields
		});
	}
	if (cause instanceof NotFoundError) {
		return new ApiError(404, 'not_found', cause.message);
	}
	if (cause instanceof ConflictError) {
		return new ApiError(409, 'version_conflict', 'The record changed since that version.', {
			current_version: cause.currentVersion
		});
	}
	if (cause instanceof FileRejectedError) {
		return fileRejectedError(cause.reason);
	}
	return null;
}

/** The API's answer to an upload that was turned down. */
export function fileRejectedError(reason: FileRejection): ApiError {
	if (reason === 'too_large') {
		return new ApiError(413, 'file_too_large', 'The file is larger than the upload limit.');
	}
	if (reason === 'empty') {
		return new ApiError(422, 'file_empty', 'The file is empty.');
	}
	return new ApiError(422, 'file_type', 'This type of file is not accepted here.');
}

export function errorBody(error: ApiError): { error: Record<string, unknown> } {
	return { error: { code: error.code, message: error.message, ...error.details } };
}

export function jsonResponse(
	status: number,
	body: unknown,
	headers: Record<string, string> = {}
): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'content-type': 'application/json; charset=utf-8',
			'cache-control': 'no-store',
			...headers
		}
	});
}

export function errorResponse(error: ApiError, headers: Record<string, string> = {}): Response {
	return jsonResponse(error.status, errorBody(error), headers);
}
