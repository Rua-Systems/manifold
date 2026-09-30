import { describe, expect, it } from 'vitest';
import {
	CODE_LENGTH,
	codeLoginSchema,
	emailSchema,
	identifierSchema,
	newPasswordSchema,
	passwordChangeSchema,
	passwordResetSchema,
	PASSWORD_MIN_LENGTH,
	passwordSchema,
	usernameSchema
} from './auth';

describe('emailSchema', () => {
	it('trims and accepts a valid address', () => {
		const result = emailSchema.safeParse('  owner@example.com ');

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data).toBe('owner@example.com');
		}
	});

	it('reports a missing value before a malformed one', () => {
		const empty = emailSchema.safeParse('   ');
		const malformed = emailSchema.safeParse('owner@');

		expect(empty.success).toBe(false);
		expect(malformed.success).toBe(false);
		if (!empty.success && !malformed.success) {
			expect(empty.error.issues).toHaveLength(1);
			expect(empty.error.issues[0].message).not.toBe(malformed.error.issues[0].message);
		}
	});
});

describe('newPasswordSchema', () => {
	it(`requires at least ${PASSWORD_MIN_LENGTH} characters`, () => {
		const tooShort = 'x'.repeat(PASSWORD_MIN_LENGTH - 1);
		const longEnough = 'x'.repeat(PASSWORD_MIN_LENGTH);

		expect(newPasswordSchema.safeParse(tooShort).success).toBe(false);
		expect(newPasswordSchema.safeParse(longEnough).success).toBe(true);
	});
});

describe('codeLoginSchema', () => {
	it(`accepts exactly ${CODE_LENGTH} digits`, () => {
		const email = 'owner@example.com';
		const exact = '1'.repeat(CODE_LENGTH);
		const tooShort = '1'.repeat(CODE_LENGTH - 1);

		expect(codeLoginSchema.safeParse({ email, code: exact }).success).toBe(true);
		expect(codeLoginSchema.safeParse({ email, code: tooShort }).success).toBe(false);
		expect(codeLoginSchema.safeParse({ email, code: 'abcdef' }).success).toBe(false);
	});
});

describe('passwordResetSchema', () => {
	const valid = {
		email: 'owner@example.com',
		code: '123456',
		password: 'correct horse',
		confirmPassword: 'correct horse'
	};

	it('accepts matching passwords', () => {
		expect(passwordResetSchema.safeParse(valid).success).toBe(true);
	});

	it('reports a mismatch on the confirmation field', () => {
		const result = passwordResetSchema.safeParse({ ...valid, confirmPassword: 'different' });

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0].path).toEqual(['confirmPassword']);
		}
	});
});

describe('usernameSchema', () => {
	it('accepts 3 to 32 lowercase letters, digits, dots, underscores and hyphens', () => {
		for (const value of ['abc', 'owner.name_1-x', 'a'.repeat(32)]) {
			expect(usernameSchema.safeParse(value).success).toBe(true);
		}
	});

	it('rejects anything else', () => {
		for (const value of ['ab', 'a'.repeat(33), 'Owner', 'with space', 'emoji!', '']) {
			expect(usernameSchema.safeParse(value).success).toBe(false);
		}
	});
});

describe('identifierSchema', () => {
	it('accepts a username in any case or an email address', () => {
		for (const value of ['owner', 'Owner', 'owner@example.com']) {
			expect(identifierSchema.safeParse(value).success).toBe(true);
		}
	});

	it('rejects malformed values', () => {
		for (const value of ['', 'no', 'owner@', 'bad name']) {
			expect(identifierSchema.safeParse(value).success).toBe(false);
		}
	});
});

describe('passwordChangeSchema', () => {
	it('needs the current password and a matching new one', () => {
		const valid = {
			currentPassword: 'old',
			password: 'new password',
			confirmPassword: 'new password'
		};

		expect(passwordChangeSchema.safeParse(valid).success).toBe(true);
		expect(passwordChangeSchema.safeParse({ ...valid, currentPassword: '' }).success).toBe(
			false
		);
		expect(passwordChangeSchema.safeParse({ ...valid, confirmPassword: 'other' }).success).toBe(
			false
		);
	});
});

describe('input bounds', () => {
	it('refuses overlong passwords and addresses', () => {
		expect(passwordSchema.safeParse('x'.repeat(1024)).success).toBe(true);
		expect(passwordSchema.safeParse('x'.repeat(1025)).success).toBe(false);
		expect(emailSchema.safeParse(`${'a'.repeat(250)}@x.io`).success).toBe(false);
	});
});
