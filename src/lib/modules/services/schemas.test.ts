import { describe, expect, it } from 'vitest';
import { serviceSchema } from './schemas';

const valid = { alias: 'Grafana', url: 'https://grafana.example.com' };

describe('serviceSchema', () => {
	it('accepts http and https addresses', () => {
		expect(serviceSchema.safeParse(valid).success).toBe(true);
		expect(
			serviceSchema.safeParse({ ...valid, url: 'http://10.0.0.5:3000/login' }).success
		).toBe(true);
	});

	it('rejects every other scheme', () => {
		for (const url of [
			'javascript:alert(1)',
			'JAVASCRIPT:alert(1)',
			'data:text/html,<script>alert(1)</script>',
			'file:///etc/passwd',
			'ftp://files.example.com',
			'mailto:someone@example.com',
			'//example.com',
			'example.com',
			''
		]) {
			expect(serviceSchema.safeParse({ ...valid, url }).success, url).toBe(false);
		}
	});

	it('keeps the alias between 1 and 60 characters', () => {
		expect(serviceSchema.safeParse({ ...valid, alias: '   ' }).success).toBe(false);
		expect(serviceSchema.safeParse({ ...valid, alias: 'x'.repeat(60) }).success).toBe(true);
		expect(serviceSchema.safeParse({ ...valid, alias: 'x'.repeat(61) }).success).toBe(false);
	});
});
