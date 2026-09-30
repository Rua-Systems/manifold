const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids from URLs and forms are checked before they reach a uuid column, which would reject them loudly. */
export function isUuid(value: string): boolean {
	return UUID_PATTERN.test(value);
}
