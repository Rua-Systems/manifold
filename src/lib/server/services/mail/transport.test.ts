import { describe, expect, it } from 'vitest';
import { requiresTls, senderAddress } from './transport';

describe('SMTP transport', () => {
	it('requires TLS for every relay but one on the same machine', () => {
		expect(requiresTls('smtp.example.com')).toBe(true);
		expect(requiresTls('10.0.0.5')).toBe(true);
		expect(requiresTls('localhost')).toBe(false);
		expect(requiresTls('127.0.0.1')).toBe(false);
		expect(requiresTls('::1')).toBe(false);
	});

	it('names the sender after the organization when MAIL_FROM has no name', () => {
		expect(senderAddress('no-reply@example.com', 'Rua "Home"')).toBe(
			'"Rua Home" <no-reply@example.com>'
		);
		expect(senderAddress('Ops <ops@example.com>', 'Rua')).toBe('Ops <ops@example.com>');
		expect(senderAddress(undefined, 'Rua')).toBe('');
	});
});
