import { describe, expect, it } from 'vitest';
import {
	countFailedCredentialCheck,
	isCredentialCheckBlocked,
	isUploadLimited,
	RateLimiter
} from './rate-limit';

const LIMIT = { max: 2, windowMs: 1000 };

describe('RateLimiter', () => {
	it('allows attempts up to the limit', () => {
		const limiter = new RateLimiter();

		expect(limiter.hit('a', LIMIT, 0)).toBe(false);
		expect(limiter.hit('a', LIMIT, 10)).toBe(false);
		expect(limiter.hit('a', LIMIT, 20)).toBe(true);
	});

	it('starts a new window once the old one expires', () => {
		const limiter = new RateLimiter();
		limiter.hit('a', LIMIT, 0);
		limiter.hit('a', LIMIT, 0);
		limiter.hit('a', LIMIT, 0);

		expect(limiter.hit('a', LIMIT, 1000)).toBe(false);
	});

	it('counts keys separately', () => {
		const limiter = new RateLimiter();
		limiter.hit('a', LIMIT, 0);
		limiter.hit('a', LIMIT, 0);

		expect(limiter.hit('a', LIMIT, 0)).toBe(true);
		expect(limiter.hit('b', LIMIT, 0)).toBe(false);
	});

	it('reports what is left of the window', () => {
		const limiter = new RateLimiter();

		expect(limiter.consume('a', LIMIT, 100)).toEqual({
			limited: false,
			remaining: 1,
			resetAt: 1100
		});
		expect(limiter.consume('a', LIMIT, 200)).toEqual({
			limited: false,
			remaining: 0,
			resetAt: 1100
		});
		expect(limiter.consume('a', LIMIT, 300)).toEqual({
			limited: true,
			remaining: 0,
			resetAt: 1100
		});
	});
});

describe('failed credential checks', () => {
	it('block the account after five wrong entries within a minute', () => {
		const userId = `owner-${Math.random()}`;
		const start = 10_000_000;
		for (let attempt = 0; attempt < 4; attempt += 1) {
			countFailedCredentialCheck(userId, start + attempt);
		}
		expect(isCredentialCheckBlocked(userId, start + 5)).toBe(false);

		countFailedCredentialCheck(userId, start + 6);
		expect(isCredentialCheckBlocked(userId, start + 7)).toBe(true);
		expect(isCredentialCheckBlocked(userId, start + 60_000)).toBe(false);
	});
});

describe('editor uploads', () => {
	it('allow thirty a minute per account', () => {
		const userId = `owner-${Math.random()}`;
		const start = 20_000_000;
		for (let upload = 0; upload < 30; upload += 1) {
			expect(isUploadLimited(userId, start + upload)).toBe(false);
		}
		expect(isUploadLimited(userId, start + 31)).toBe(true);
		expect(isUploadLimited(userId, start + 60_000)).toBe(false);
	});
});
