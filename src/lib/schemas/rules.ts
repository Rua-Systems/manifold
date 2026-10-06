// Shared by the Zod schemas, Better Auth and the CLI. This module imports nothing, so the CLI bundle
// can use it without pulling in the message catalogue.

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;
export const USERNAME_PATTERN = /^[a-z0-9._-]+$/;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const DISPLAY_NAME_MAX_LENGTH = 100;

export const CODE_LENGTH = 6;

/** The longest address RFC 5321 allows. */
export const EMAIL_MAX_LENGTH = 254;

/** A password typed to sign in or confirm; new passwords stop at PASSWORD_MAX_LENGTH anyway. */
export const PASSWORD_INPUT_MAX_LENGTH = 1024;

/** Service and vault addresses. */
export const URL_MAX_LENGTH = 2048;

/** Versions are PostgreSQL `integer` columns. */
export const VERSION_MAX = 2_147_483_647;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Whether `value` is a real `YYYY-MM-DD` day, so `2026-13-45` is refused. */
export function isCalendarDate(value: string): boolean {
	if (!DATE_PATTERN.test(value)) {
		return false;
	}
	const date = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** A `YYYY-MM-DD` day as the end of that day in UTC, when a key or token chosen for it expires. */
export function endOfUtcDay(value: string): Date {
	return new Date(new Date(`${value}T00:00:00Z`).getTime() + 24 * 60 * 60 * 1000);
}

export function isValidUsername(value: string): boolean {
	return (
		value.length >= USERNAME_MIN_LENGTH &&
		value.length <= USERNAME_MAX_LENGTH &&
		USERNAME_PATTERN.test(value)
	);
}
