import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM for vault values. Plain Node, no app imports: the CLI's key rotation uses it too.

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

export interface SealedValue {
	ciphertext: Buffer;
	iv: Buffer;
	authTag: Buffer;
}

export class VaultKeyError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'VaultKeyError';
	}
}

/** Reads ENCRYPTION_KEY (32 random bytes, base64) into a key. */
export function parseVaultKey(base64: string): Buffer {
	const key = Buffer.from(base64.trim(), 'base64');
	if (key.length !== KEY_BYTES) {
		throw new VaultKeyError(`The key must be ${KEY_BYTES} random bytes, base64 encoded.`);
	}
	return key;
}

/**
 * Encrypts a value for one secret. The secret's id is authenticated with it, so a ciphertext
 * copied onto another row fails to decrypt.
 */
export function seal(value: string, secretId: string, key: Buffer): SealedValue {
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv(ALGORITHM, key, iv);
	cipher.setAAD(Buffer.from(secretId, 'utf8'));
	const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
	return { ciphertext, iv, authTag: cipher.getAuthTag() };
}

/** Decrypts a value. A wrong key, another secret's id or any change to the bytes throws. */
export function unseal(sealed: SealedValue, secretId: string, key: Buffer): string {
	const decipher = createDecipheriv(ALGORITHM, key, sealed.iv);
	decipher.setAAD(Buffer.from(secretId, 'utf8'));
	decipher.setAuthTag(sealed.authTag);
	return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]).toString('utf8');
}
