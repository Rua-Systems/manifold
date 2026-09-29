// Shared by the Zod schemas, Better Auth and the CLI. This module imports nothing, so the CLI bundle
// can use it without pulling in the message catalogue.

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;
export const USERNAME_PATTERN = /^[a-z0-9._-]+$/;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const DISPLAY_NAME_MAX_LENGTH = 100;

export const CODE_LENGTH = 6;

export function isValidUsername(value: string): boolean {
	return (
		value.length >= USERNAME_MIN_LENGTH &&
		value.length <= USERNAME_MAX_LENGTH &&
		USERNAME_PATTERN.test(value)
	);
}
