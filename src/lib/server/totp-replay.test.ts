import { describe, expect, it } from 'vitest';
import { rememberTotp, wasTotpUsed } from './totp-replay';

describe('TOTP replay guard', () => {
	it('refuses an accepted code for two minutes', () => {
		const start = 1_000_000;
		expect(wasTotpUsed('123456', start)).toBe(false);

		rememberTotp('123456', start);
		expect(wasTotpUsed('123456', start + 1)).toBe(true);
		expect(wasTotpUsed('123456', start + 119_999)).toBe(true);
		expect(wasTotpUsed('123456', start + 120_000)).toBe(false);
	});

	it('keeps codes apart', () => {
		const start = 5_000_000;
		rememberTotp('111111', start);
		expect(wasTotpUsed('222222', start + 1)).toBe(false);
	});
});
