// The application log: one JSON object per line on standard output (standard error for errors),
// with the time, the level and a message, so a log shipper can read it without parsing text.
// Callers pass identifiers and outcomes only: never passwords, codes, keys, cookies, secrets or the
// values of notes and the vault.

export type LogLevel = 'info' | 'warn' | 'error';

export type LogFields = Record<string, string | number | boolean | null | undefined>;

function errorFields(error: unknown): LogFields {
	if (error instanceof Error) {
		return { error: error.message, errorName: error.name, stack: error.stack };
	}
	return { error: String(error) };
}

/** Writes one log line. `error` adds its message and stack. */
export function log(
	level: LogLevel,
	message: string,
	fields: LogFields = {},
	error?: unknown
): void {
	const line = JSON.stringify({
		time: new Date().toISOString(),
		level,
		message,
		...fields,
		...(error === undefined ? {} : errorFields(error))
	});
	if (level === 'error') {
		console.error(line);
	} else {
		console.log(line);
	}
}

/**
 * A security relevant refusal: a missing or wrong key, a refused scope, a rate limit, a cross-site
 * form, a body over the limit, a rejected upload. Logged at `warn` with the name of the event.
 */
export function logSecurityEvent(event: string, fields: LogFields = {}): void {
	log('warn', 'Security event', { event, ...fields });
}
