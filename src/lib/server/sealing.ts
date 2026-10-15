import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM under ENCRYPTION_KEY, for vault values and the secrets of data sources. Plain Node,
// no app imports: the CLI's key rotation uses it too.

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;
// GCM would also accept a shortened tag; only the full 16 bytes are ever written or accepted.
const AUTH_TAG_BYTES = 16;

export interface SealedValue {
	ciphertext: Buffer;
	iv: Buffer;
	authTag: Buffer;
}

export class EncryptionKeyError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'EncryptionKeyError';
	}
}

/** Reads ENCRYPTION_KEY (32 random bytes, base64) into a key. */
export function parseEncryptionKey(base64: string): Buffer {
	const key = Buffer.from(base64.trim(), 'base64');
	if (key.length !== KEY_BYTES) {
		throw new EncryptionKeyError(`The key must be ${KEY_BYTES} random bytes, base64 encoded.`);
	}
	return key;
}

/**
 * Encrypts a value for one row. The row's id is authenticated with it, so a ciphertext copied
 * onto another row fails to decrypt.
 */
export function seal(value: string, secretId: string, key: Buffer): SealedValue {
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_BYTES });
	cipher.setAAD(Buffer.from(secretId, 'utf8'));
	const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
	return { ciphertext, iv, authTag: cipher.getAuthTag() };
}

/** Decrypts a value. A wrong key, another secret's id or any change to the bytes throws. */
export function unseal(sealed: SealedValue, secretId: string, key: Buffer): string {
	if (sealed.authTag.length !== AUTH_TAG_BYTES) {
		throw new Error('The stored authentication tag has the wrong length.');
	}
	const decipher = createDecipheriv(ALGORITHM, key, sealed.iv, { authTagLength: AUTH_TAG_BYTES });
	decipher.setAAD(Buffer.from(secretId, 'utf8'));
	decipher.setAuthTag(sealed.authTag);
	return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]).toString('utf8');
}
