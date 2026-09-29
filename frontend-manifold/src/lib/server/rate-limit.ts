import type { RequestEvent } from '@sveltejs/kit';

interface RateLimit {
	max: number;
	windowMs: number;
}

interface AttemptWindow {
	count: number;
	resetAt: number;
}

const MINUTE = 60_000;

const PRUNE_THRESHOLD = 1000;

export const RATE_LIMITS = {
	signIn: { max: 5, windowMs: MINUTE },
	sendCode: { max: 3, windowMs: MINUTE },
	stepUp: { max: 5, windowMs: MINUTE }
} satisfies Record<string, RateLimit>;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

/**
 * Fixed window counter. Better Auth does not rate limit `auth.api` calls, so form actions use this.
 */
export class RateLimiter {
	private windows = new Map<string, AttemptWindow>();

	/** Counts one attempt for `key` and reports whether it exceeds the limit. */
	hit(key: string, limit: RateLimit, now: number): boolean {
		if (this.windows.size > PRUNE_THRESHOLD) {
			this.prune(now);
		}

		const current = this.windows.get(key);
		if (current === undefined || current.resetAt <= now) {
			this.windows.set(key, { count: 1, resetAt: now + limit.windowMs });
			return false;
		}

		current.count += 1;
		return current.count > limit.max;
	}

	private prune(now: number): void {
		for (const [key, entry] of this.windows) {
			if (entry.resetAt <= now) {
				this.windows.delete(key);
			}
		}
	}
}

// Shared across requests on purpose: counting attempts per client address is the whole point, and
// nothing stored here is ever sent back to a visitor.
const limiter = new RateLimiter();

export function isRateLimited(event: RequestEvent, bucket: RateLimitBucket): boolean {
	const key = `${bucket}:${event.getClientAddress()}`;
	return limiter.hit(key, RATE_LIMITS[bucket], Date.now());
}
