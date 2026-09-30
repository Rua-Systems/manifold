import { describe, expect, it } from 'vitest';
import { RateLimiter } from './rate-limit';

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
