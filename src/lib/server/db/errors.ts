// Postgres error codes the app turns into messages for the owner.

/** A unique index refused the row, such as a second folder with the same name. */
export const UNIQUE_VIOLATION = '23505';
/** A foreign key refused the change, such as deleting a folder something moved into meanwhile. */
export const FOREIGN_KEY_VIOLATION = '23503';

/** Whether Postgres answered with this error code, also when Drizzle wraps the driver's error. */
export function hasErrorCode(error: unknown, code: string): boolean {
	let current: unknown = error;
	while (current instanceof Error) {
		if ((current as { code?: unknown }).code === code) {
			return true;
		}
		current = current.cause;
	}
	return false;
}
