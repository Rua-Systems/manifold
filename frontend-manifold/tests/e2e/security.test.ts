import { expect, test } from './fixtures';

test('the health check answers without authentication', async ({ request }) => {
	const response = await request.get('/healthz');

	expect(response.status()).toBe(200);
	expect(await response.json()).toEqual({ status: 'ok' });
});

test('pages carry the security headers', async ({ request }) => {
	const response = await request.get('/login');
	const headers = response.headers();

	expect(headers['x-content-type-options']).toBe('nosniff');
	expect(headers['x-frame-options']).toBe('DENY');
	expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
	expect(headers['x-robots-tag']).toBe('noindex, nofollow');
	expect(headers['permissions-policy']).toContain('geolocation=(self)');
	// ORIGIN is plain http in the tests, so HSTS must stay off.
	expect(headers['strict-transport-security']).toBeUndefined();

	const csp = headers['content-security-policy'];
	expect(csp).toContain("default-src 'self'");
	expect(csp).toMatch(/script-src 'self' 'nonce-/);
	expect(csp).toContain("frame-ancestors 'none'");
	expect(csp).toContain("object-src 'none'");
});

test('every response asks search engines to stay away', async ({ request }) => {
	const health = await request.get('/healthz');
	expect(health.headers()['x-robots-tag']).toBe('noindex, nofollow');

	const robots = await request.get('/robots.txt');
	expect(await robots.text()).toContain('Disallow: /');
});

test('the inline theme script runs under the content security policy', async ({ page }) => {
	const violations: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error' && message.text().includes('Content Security Policy')) {
			violations.push(message.text());
		}
	});

	await page.goto('/login');

	await expect(page.locator('html')).toHaveAttribute('data-theme', /^(light|dark)$/);
	expect(violations).toEqual([]);
});

test('the mail preview does not exist outside development', async ({ request }) => {
	const response = await request.get('/dev/mail/sign-in-code');

	expect(response.status()).toBe(404);
});
