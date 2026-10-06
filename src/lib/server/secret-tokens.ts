import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

// Secret tokens: `<kind>_<8 character prefix>_<32 random bytes, base64url>`, for API keys (`mfd`)
// and note tokens (`mfn`). The prefix finds the row; only a SHA-256 hash of the whole token is
// stored, and hashes are compared in constant time. The token itself is shown once.

export type TokenKind = 'mfd' | 'mfn';

const PREFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const PREFIX_LENGTH = 8;
const TOKEN_PATTERN = /^(mfd|mfn)_([a-z0-9]{8})_([A-Za-z0-9_-]{43})$/;

export interface IssuedToken {
	/** The whole token, for the owner to copy once. */
	token: string;
	prefix: string;
	hash: string;
}

export function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

function newPrefix(): string {
	let prefix = '';
	for (let index = 0; index < PREFIX_LENGTH; index += 1) {
		prefix += PREFIX_ALPHABET[randomInt(PREFIX_ALPHABET.length)];
	}
	return prefix;
}

export function issueToken(kind: TokenKind): IssuedToken {
	const prefix = newPrefix();
	const token = `${kind}_${prefix}_${randomBytes(32).toString('base64url')}`;
	return { token, prefix, hash: hashToken(token) };
}

/** The prefix of a well formed token of this kind, or null for anything else. */
export function tokenPrefix(presented: string, kind: TokenKind): string | null {
	const match = TOKEN_PATTERN.exec(presented);
	if (match === null || match[1] !== kind) {
		return null;
	}
	return match[2];
}

/** Whether a presented token hashes to the stored hash, compared in constant time. */
export function tokenMatches(presented: string, storedHash: string): boolean {
	const expected = Buffer.from(storedHash, 'hex');
	const actual = Buffer.from(hashToken(presented), 'hex');
	return expected.length === actual.length && timingSafeEqual(expected, actual);
}
