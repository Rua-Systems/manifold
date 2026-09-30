import { describe, expect, it } from 'vitest';
import { generateBackupCodes } from './backup-codes';

describe('backup codes', () => {
	it('are ten codes of 24 base32 characters in four groups', () => {
		const codes = generateBackupCodes();
		expect(codes).toHaveLength(10);
		for (const code of codes) {
			expect(code).toMatch(/^[a-z2-7]{6}(-[a-z2-7]{6}){3}$/);
		}
	});

	it('never repeat', () => {
		const codes = new Set([...generateBackupCodes(), ...generateBackupCodes()]);
		expect(codes.size).toBe(20);
	});
});
