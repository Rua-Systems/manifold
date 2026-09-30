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

test('static files, API answers and pages carry the baseline headers', async ({ request }) => {
	for (const path of ['/favicon.svg', '/robots.txt', '/healthz', '/api/v1/me']) {
		const headers = (await request.get(path)).headers();
		expect(headers['x-content-type-options'], path).toBe('nosniff');
		expect(headers['x-frame-options'], path).toBe('DENY');
		expect(headers['cross-origin-opener-policy'], path).toBe('same-origin');
		expect(headers['content-security-policy'], path).toContain("default-src 'none'");
	}

	const page = (await request.get('/login')).headers();
	expect(page['content-security-policy']).toContain("base-uri 'none'");
	expect(page['cache-control']).toBe('no-store');
	expect(page['content-type']).toBe('text/html; charset=utf-8');
});

test('unusual methods are refused before they reach the app', async ({ request }) => {
	const response = await request.fetch('/login', { method: 'TRACE' });
	expect(response.status()).toBe(405);
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

test('cross-site form posts are refused outside the API', async ({ page }) => {
	const response = await page.request.post('/login?/password', {
		form: { identifier: 'owner', password: 'x' },
		headers: { Origin: 'https://attacker.example' }
	});
	expect(response.status()).toBe(403);
	expect(await response.text()).toBe('Cross-site POST form submissions are forbidden');
});
