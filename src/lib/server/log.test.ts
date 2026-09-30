import { afterEach, describe, expect, it, vi } from 'vitest';
import { log, logSecurityEvent } from './log';

afterEach(() => {
	vi.restoreAllMocks();
});

describe('log', () => {
	it('writes one JSON line with time, level, message and fields', () => {
		const output = vi.spyOn(console, 'log').mockImplementation(() => {});
		log('info', 'Applied migrations', { count: 2 });

		const line = JSON.parse(String(output.mock.calls[0][0]));
		expect(line).toMatchObject({ level: 'info', message: 'Applied migrations', count: 2 });
		expect(Number.isNaN(Date.parse(line.time))).toBe(false);
	});

	it('writes errors to standard error with their message', () => {
		const output = vi.spyOn(console, 'error').mockImplementation(() => {});
		log('error', 'Sending a mail failed', {}, new Error('Connection refused'));

		const line = JSON.parse(String(output.mock.calls[0][0]));
		expect(line).toMatchObject({ level: 'error', error: 'Connection refused' });
	});

	it('names security events', () => {
		const output = vi.spyOn(console, 'log').mockImplementation(() => {});
		logSecurityEvent('invalid_key', { path: '/api/v1/me' });

		expect(JSON.parse(String(output.mock.calls[0][0]))).toMatchObject({
			level: 'warn',
			message: 'Security event',
			event: 'invalid_key',
			path: '/api/v1/me'
		});
	});
});
