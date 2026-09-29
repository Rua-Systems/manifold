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
});
