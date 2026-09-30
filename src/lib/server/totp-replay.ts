// Better Auth accepts a TOTP code during its own 30 second step and the steps next to it, and keeps
// no record of used codes. Accepted codes are refused here for longer than that, so a code that
// was seen once, over a shoulder or in a log, cannot be used a second time. There is one account,
// so the code alone is the key. Kept in memory: Manifold runs as a single process.

const REUSE_WINDOW_MS = 2 * 60 * 1000;

const usedUntil = new Map<string, number>();

function prune(now: number): void {
	for (const [code, until] of usedUntil) {
		if (until <= now) {
			usedUntil.delete(code);
		}
	}
}

/** Whether the code was accepted within the reuse window. */
export function wasTotpUsed(code: string, now = Date.now()): boolean {
	const until = usedUntil.get(code);
	return until !== undefined && until > now;
}

/** Records an accepted code, so it is refused until the reuse window ends. */
export function rememberTotp(code: string, now = Date.now()): void {
	prune(now);
	usedUntil.set(code, now + REUSE_WINDOW_MS);
}
