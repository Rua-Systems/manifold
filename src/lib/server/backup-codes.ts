import { randomBytes } from 'node:crypto';

// Better Auth's own backup codes carry about 60 bits. These carry 120: 24 characters of lowercase
// base32 from the system's random source, in four groups of six to make them easier to copy.

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
const CODE_COUNT = 10;
const GROUPS = 4;
const GROUP_LENGTH = 6;

function randomGroup(): string {
	const bytes = randomBytes(GROUP_LENGTH);
	let group = '';
	for (const byte of bytes) {
		// 256 is a multiple of 32, so taking the low five bits keeps every character equally likely.
		group += ALPHABET[byte & 31];
	}
	return group;
}

/** Ten fresh backup codes such as `k3xq7a-...`, 120 random bits each. */
export function generateBackupCodes(): string[] {
	return Array.from({ length: CODE_COUNT }, () =>
		Array.from({ length: GROUPS }, randomGroup).join('-')
	);
}
