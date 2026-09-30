import { describe, expect, it } from 'vitest';
import { summarizeUserAgent } from './user-agent';

describe('summarizeUserAgent', () => {
	it('recognises common browsers and systems', () => {
		const cases: [string, string, string][] = [
			[
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
				'Chrome',
				'Windows'
			],
			[
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0',
				'Edge',
				'Windows'
			],
			[
				'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
				'Safari',
				'macOS'
			],
			[
				'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
				'Safari',
				'iOS'
			],
			[
				'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36',
				'Chrome',
				'Android'
			],
			[
				'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0',
				'Firefox',
				'Linux'
			]
		];

		for (const [agent, browser, os] of cases) {
			expect(summarizeUserAgent(agent)).toEqual({ browser, os });
		}
	});

	it('returns nulls for unknown or missing agents', () => {
		expect(summarizeUserAgent(null)).toEqual({ browser: null, os: null });
		expect(summarizeUserAgent('curl/8.0')).toEqual({ browser: null, os: null });
	});
});
