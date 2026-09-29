import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { fieldErrors, fromSchema, matches, textValue } from './validation';

describe('fromSchema', () => {
	const validate = fromSchema(z.string().min(3, { error: 'too short' }));

	it('returns null for valid values', () => {
		expect(validate('abcd')).toBeNull();
	});

	it('returns the first issue message for invalid values', () => {
		expect(validate('ab')).toBe('too short');
	});
});

describe('matches', () => {
	it('passes when empty or equal to the other value', () => {
		const validate = matches(
			() => 'secret',
			() => 'mismatch'
		);

		expect(validate('')).toBeNull();
		expect(validate('secret')).toBeNull();
	});

	it('fails when different from the other value', () => {
		const validate = matches(
			() => 'secret',
			() => 'mismatch'
		);

		expect(validate('other')).toBe('mismatch');
	});
});

describe('fieldErrors', () => {
	it('keeps the first message per field', () => {
		const schema = z.object({
			email: z.string().min(1, { error: 'required' }).min(5, { error: 'short' }),
			code: z.string().min(1, { error: 'code required' })
		});
		const result = schema.safeParse({ email: '', code: '' });

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(fieldErrors(result.error)).toEqual({ email: 'required', code: 'code required' });
		}
	});
});

describe('textValue', () => {
	it('reads strings and ignores missing or file entries', () => {
		const data = new FormData();
		data.set('email', 'owner@example.com');
		data.set('upload', new Blob(['x']));

		expect(textValue(data, 'email')).toBe('owner@example.com');
		expect(textValue(data, 'upload')).toBe('');
		expect(textValue(data, 'missing')).toBe('');
	});
});
