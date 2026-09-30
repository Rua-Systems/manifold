import { describe, expect, it } from 'vitest';
import { passwordProblem } from './policy';

const CONTEXT = { username: 'hasan', email: 'owner@example.com', organizationName: 'Rua Systems' };

describe('passwordProblem', () => {
	it('refuses common passwords whatever their case', () => {
		expect(passwordProblem('password', CONTEXT)).toBe('common');
		expect(passwordProblem('Password1', CONTEXT)).toBe('common');
		expect(passwordProblem('qwertyuiop', CONTEXT)).toBe('common');
	});

	it('refuses passwords built on the product, the organization or the account', () => {
		expect(passwordProblem('my-manifold-2026', CONTEXT)).toBe('context');
		expect(passwordProblem('systems are fine', CONTEXT)).toBe('context');
		expect(passwordProblem('hasan-likes-maps', CONTEXT)).toBe('context');
		expect(passwordProblem('owner@example.com!', CONTEXT)).toBe('context');
	});

	it('accepts an unrelated passphrase', () => {
		expect(passwordProblem('violet ferry at dawn', CONTEXT)).toBeNull();
		expect(passwordProblem('violet ferry at dawn', {})).toBeNull();
	});
});
