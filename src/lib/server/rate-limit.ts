import type { RequestEvent } from '@sveltejs/kit';
import { logSecurityEvent } from './log';

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
	stepUp: { max: 5, windowMs: MINUTE },
	failedCredentialCheck: { max: 5, windowMs: MINUTE },
	upload: { max: 30, windowMs: MINUTE }
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

	/** Reports whether `key` already used up its window, without counting an attempt. */
	isExhausted(key: string, limit: RateLimit, now: number): boolean {
		const current = this.windows.get(key);
		return current !== undefined && current.resetAt > now && current.count >= limit.max;
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
	const ip = event.getClientAddress();
	const limited = limiter.hit(`${bucket}:${ip}`, RATE_LIMITS[bucket], Date.now());
	if (limited) {
		logSecurityEvent('rate_limited', { bucket, ip, path: event.url.pathname });
	}
	return limited;
}

/**
 * Whether the owner's password or authenticator code was entered wrongly too often in the last
 * minute by a signed in session. Keyed by the account rather than the address, so a stolen
 * session cookie cannot keep guessing from many addresses; successful checks do not count.
 */
export function isCredentialCheckBlocked(userId: string, now = Date.now()): boolean {
	const blocked = limiter.isExhausted(
		`failedCredentialCheck:${userId}`,
		RATE_LIMITS.failedCredentialCheck,
		now
	);
	if (blocked) {
		logSecurityEvent('credential_checks_blocked', { userId });
	}
	return blocked;
}

/** Counts one wrong password or code entered by a signed in session. */
export function countFailedCredentialCheck(userId: string, now = Date.now()): void {
	limiter.hit(`failedCredentialCheck:${userId}`, RATE_LIMITS.failedCredentialCheck, now);
}

/** Counts one image upload from the editor for the account; 30 a minute is far above pasting by hand. */
export function isUploadLimited(userId: string, now = Date.now()): boolean {
	const limited = limiter.hit(`upload:${userId}`, RATE_LIMITS.upload, now);
	if (limited) {
		logSecurityEvent('rate_limited', { bucket: 'upload', userId });
	}
	return limited;
}

/** Counts one API request for a key against API_RATE_LIMIT_PER_MINUTE. */
export function consumeApiRequest(
	keyId: string,
	perMinute: number,
	now = Date.now()
): RateLimitState {
	return limiter.consume(`api:${keyId}`, { max: perMinute, windowMs: MINUTE }, now);
}
