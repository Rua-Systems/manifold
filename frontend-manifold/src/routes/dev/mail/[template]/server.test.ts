import { loadEnv } from '$lib/server/env';
import { beforeAll, describe, expect, it } from 'vitest';
import { GET } from './+server';

type Event = Parameters<typeof GET>[0];

function requestFor(template: string): Event {
	return { params: { template } } as unknown as Event;
}

beforeAll(() => {
	loadEnv(
		{
			ORIGIN: 'http://localhost:5173',
			ORGANIZATION_NAME: 'Preview Org',
			DATABASE_URL: 'postgres://unused@127.0.0.1:1/unused',
			BETTER_AUTH_SECRET: 'x'.repeat(32),
			ENCRYPTION_KEY: Buffer.alloc(32).toString('base64')
		},
		{ dev: true }
	);
});

describe('GET /dev/mail/[template]', () => {
	it('renders a template in every locale, HTML and text', async () => {
		const response = await GET(requestFor('new-sign-in'));
		const body = await response.text();

		expect(response.headers.get('Content-Type')).toContain('text/html');
		expect(body).toContain('New sign in to Preview Org');
		expect(body).toContain('Preview Org hesabınıza yeni giriş');
		expect(body.match(/<iframe/g)).toHaveLength(2);
		expect(body.match(/<pre>/g)).toHaveLength(2);
	});

	it('answers 404 for an unknown template', () => {
		expect(() => GET(requestFor('nope'))).toThrow();
	});
});
