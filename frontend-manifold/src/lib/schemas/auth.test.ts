import { describe, expect, it } from 'vitest';
import {
	CODE_LENGTH,
	codeLoginSchema,
	emailSchema,
	newPasswordSchema,
	passwordResetSchema,
	PASSWORD_MIN_LENGTH
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
