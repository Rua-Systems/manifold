import { beforeAll, describe, expect, it } from 'vitest';
import { checkBodySize } from './body-limit';
import { loadEnv } from './env';

beforeAll(() => {
	loadEnv(
		{
			ORIGIN: 'http://localhost:5173',
			DATABASE_URL: 'postgres://unused@127.0.0.1:1/unused',
			BETTER_AUTH_SECRET: 'x'.repeat(32),
			ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
			UPLOAD_MAX_BYTES: String(1024 * 1024)
		},
		{ dev: true }
	);
});

function post(headers: Record<string, string>): Request {
	return new Request('http://localhost/', { method: 'POST', headers });
}

describe('checkBodySize', () => {
	it('lets reads and small bodies through', () => {
		expect(checkBodySize(new Request('http://localhost/'))).toBe('ok');
		expect(checkBodySize(post({ 'content-length': '100' }))).toBe('ok');
	});

	it('caps ordinary bodies at 5 MB', () => {
		expect(checkBodySize(post({ 'content-length': String(5 * 1024 * 1024) }))).toBe('ok');
		expect(checkBodySize(post({ 'content-length': String(5 * 1024 * 1024 + 1) }))).toBe(
			'too_large'
		);
	});

	it('caps uploads at UPLOAD_MAX_BYTES plus room for the form', () => {
		const multipart = { 'content-type': 'multipart/form-data; boundary=x' };

		expect(checkBodySize(post({ ...multipart, 'content-length': String(1024 * 1024) }))).toBe(
			'ok'
		);
		expect(
			checkBodySize(post({ ...multipart, 'content-length': String(2 * 1024 * 1024) }))
		).toBe('too_large');
	});

	it('asks chunked bodies for a length', () => {
		expect(checkBodySize(post({ 'transfer-encoding': 'chunked' }))).toBe('length_required');
	});
});
