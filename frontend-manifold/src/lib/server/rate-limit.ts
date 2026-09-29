import type { RequestEvent } from '@sveltejs/kit';

export interface RateLimit {
	max: number;
	windowMs: number;
}

export interface RateLimitState {
	limited: boolean;
	remaining: number;
	/** When the window starts over, in milliseconds since the epoch. */
	resetAt: number;
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
		return this.consume(key, limit, now).limited;
	}

	/** Counts one attempt and reports the state of the window, for rate limit headers. */
	consume(key: string, limit: RateLimit, now: number): RateLimitState {
		if (this.windows.size > PRUNE_THRESHOLD) {
			this.prune(now);
		}

		let current = this.windows.get(key);
		if (current === undefined || current.resetAt <= now) {
			current = { count: 0, resetAt: now + limit.windowMs };
			this.windows.set(key, current);
		}
		current.count += 1;
		return {
			limited: current.count > limit.max,
			remaining: Math.max(0, limit.max - current.count),
			resetAt: current.resetAt
		};
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

/** Counts one API request for a key against API_RATE_LIMIT_PER_MINUTE. */
export function consumeApiRequest(
	keyId: string,
	perMinute: number,
	now = Date.now()
): RateLimitState {
	return limiter.consume(`api:${keyId}`, { max: perMinute, windowMs: MINUTE }, now);
}
