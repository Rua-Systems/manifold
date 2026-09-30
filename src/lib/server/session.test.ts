import { describe, expect, it } from 'vitest';
import { toSessionUser } from './session';

describe('toSessionUser', () => {
	it('returns null without a user', () => {
		expect(toSessionUser(null)).toBeNull();
	});

	it('keeps only the fields the browser may see', () => {
		const user = {
			id: 'user-1',
			name: 'Owner',
			email: 'owner@example.com',
			username: 'owner',
			twoFactorEnabled: true,
			emailVerified: true,
			image: null,
			createdAt: new Date(0),
			updatedAt: new Date(0)
		};

		expect(toSessionUser(user)).toEqual({
			name: 'Owner',
			email: 'owner@example.com',
			username: 'owner',
			twoFactorEnabled: true
		});
	});

	it('reports a missing username as null', () => {
		expect(toSessionUser({ name: 'Owner', email: 'owner@example.com' })?.username).toBeNull();
	});
});
