import { describe, expect, it } from 'vitest';
import { hashToken, issueToken, tokenMatches, tokenPrefix } from './secret-tokens';

describe('secret tokens', () => {
	it('issues tokens of a kind with their prefix and hash', () => {
		const issued = issueToken('mfn');
		expect(issued.token).toMatch(/^mfn_[a-z0-9]{8}_[A-Za-z0-9_-]{43}$/);
		expect(issued.token.startsWith(`mfn_${issued.prefix}_`)).toBe(true);
		expect(issued.hash).toBe(hashToken(issued.token));
		expect(issueToken('mfn').token).not.toBe(issued.token);
	});

	it('reads the prefix only of a well formed token of the asked kind', () => {
		const { token, prefix } = issueToken('mfd');
		expect(tokenPrefix(token, 'mfd')).toBe(prefix);
		expect(tokenPrefix(token, 'mfn')).toBeNull();
		expect(tokenPrefix(`${token}x`, 'mfd')).toBeNull();
		expect(tokenPrefix('not-a-token', 'mfd')).toBeNull();
	});

	it('matches a token against its stored hash only', () => {
		const first = issueToken('mfn');
		const second = issueToken('mfn');
		expect(tokenMatches(first.token, first.hash)).toBe(true);
		expect(tokenMatches(second.token, first.hash)).toBe(false);
		expect(tokenMatches(first.token, 'abc')).toBe(false);
	});
});
