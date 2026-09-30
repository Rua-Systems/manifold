import { hashPassword as hashLegacyPassword } from 'better-auth/crypto';
import { describe, expect, it } from 'vitest';
import { hashPassword, passwordHashNeedsUpgrade, verifyPassword } from './hash';

describe('password hashes', () => {
	it('name their parameters and verify only the right password', async () => {
		const hash = await hashPassword('violet ferry at dawn');
		expect(hash).toMatch(/^\$scrypt\$ln=15,r=8,p=3\$/);
		expect(await verifyPassword(hash, 'violet ferry at dawn')).toBe(true);
		expect(await verifyPassword(hash, 'violet ferry at dusk')).toBe(false);
		expect(passwordHashNeedsUpgrade(hash)).toBe(false);
	});

	it('still accept Better Auth hashes and mark them for an upgrade', async () => {
		const legacy = await hashLegacyPassword('violet ferry at dawn');
		expect(await verifyPassword(legacy, 'violet ferry at dawn')).toBe(true);
		expect(await verifyPassword(legacy, 'something else')).toBe(false);
		expect(passwordHashNeedsUpgrade(legacy)).toBe(true);
	});

	it('refuse malformed hashes and parameters beyond the limits', async () => {
		expect(await verifyPassword('not a hash', 'x')).toBe(false);
		expect(await verifyPassword('$scrypt$ln=30,r=8,p=3$AAAA$AAAA', 'x')).toBe(false);
	});
});
