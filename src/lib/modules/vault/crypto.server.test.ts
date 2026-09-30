import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseVaultKey, seal, unseal, VaultKeyError } from './crypto.server';

const KEY = randomBytes(32);
const ID = '0b6f1c1e-7d2a-4c7a-9a55-2f0f4a7b3c11';

describe('vault encryption', () => {
	it('opens what it sealed, with a fresh IV every time', () => {
		const first = seal('correct horse battery staple', ID, KEY);
		const second = seal('correct horse battery staple', ID, KEY);

		expect(unseal(first, ID, KEY)).toBe('correct horse battery staple');
		expect(first.iv).toHaveLength(12);
		expect(first.authTag).toHaveLength(16);
		expect(first.iv.equals(second.iv)).toBe(false);
		expect(first.ciphertext.equals(second.ciphertext)).toBe(false);
	});

	it('keeps unicode intact', () => {
		expect(unseal(seal('şifre ключ 鍵', ID, KEY), ID, KEY)).toBe('şifre ключ 鍵');
	});

	it('refuses tampered ciphertext, tag or IV', () => {
		const sealed = seal('secret', ID, KEY);
		const flip = (buffer: Buffer) => {
			const copy = Buffer.from(buffer);
			copy[0] ^= 1;
			return copy;
		};

		expect(() => unseal({ ...sealed, ciphertext: flip(sealed.ciphertext) }, ID, KEY)).toThrow();
		expect(() => unseal({ ...sealed, authTag: flip(sealed.authTag) }, ID, KEY)).toThrow();
		expect(() => unseal({ ...sealed, iv: flip(sealed.iv) }, ID, KEY)).toThrow();
		expect(() =>
			unseal({ ...sealed, authTag: sealed.authTag.subarray(0, 4) }, ID, KEY)
		).toThrow();
	});

	it('refuses a wrong key and another secret id', () => {
		const sealed = seal('secret', ID, KEY);
		expect(() => unseal(sealed, ID, randomBytes(32))).toThrow();
		expect(() => unseal(sealed, 'another-id', KEY)).toThrow();
	});

	it('reads keys of exactly 32 bytes', () => {
		expect(parseVaultKey(KEY.toString('base64')).equals(KEY)).toBe(true);
		expect(() => parseVaultKey(randomBytes(16).toString('base64'))).toThrow(VaultKeyError);
		expect(() => parseVaultKey('not base64 at all')).toThrow(VaultKeyError);
	});
});
