import { describe, expect, it } from 'vitest';
import { isPastMaximumAge } from './sessions';

describe('isPastMaximumAge', () => {
	it('ends a session 30 days after its sign in', () => {
		const signedIn = new Date('2026-09-01T00:00:00Z');
		expect(isPastMaximumAge(signedIn, new Date('2026-09-30T23:59:59Z'))).toBe(false);
		expect(isPastMaximumAge(signedIn, new Date('2026-10-01T00:00:01Z'))).toBe(true);
	});
});
