import { createHmac } from 'node:crypto';

// RFC 6238 time based codes, so tests can act as the owner's authenticator app. Relative imports
// and Node built-ins only, like the other support files.

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function decodeBase32(value: string): Buffer {
	let bits = '';
	for (const character of value.replace(/[\s=]/g, '').toUpperCase()) {
		const index = BASE32.indexOf(character);
		if (index === -1) {
			throw new Error(`"${character}" is not base32.`);
		}
		bits += index.toString(2).padStart(5, '0');
	}
	const bytes: number[] = [];
	for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
		bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
	}
	return Buffer.from(bytes);
}

/** The six digit code an authenticator app shows for `secret` at `time`. */
export function totp(secret: string, time = Date.now()): string {
	const counter = Buffer.alloc(8);
	counter.writeBigUInt64BE(BigInt(Math.floor(time / 1000 / 30)));
	const digest = createHmac('sha1', decodeBase32(secret)).update(counter).digest();
	const offset = digest[digest.length - 1] & 0x0f;
	const binary = digest.readUInt32BE(offset) & 0x7fffffff;
	return String(binary % 1_000_000).padStart(6, '0');
}
