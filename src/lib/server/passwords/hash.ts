import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { verifyPassword as verifyLegacyPassword } from 'better-auth/crypto';

// Password hashes: scrypt with OWASP's parameters (N = 2^15, r = 8, p = 3) in a format that names
// them, `$scrypt$ln=15,r=8,p=3$<salt>$<key>`, so they can be raised later without breaking stored
// hashes. Better Auth's own `salt:key` hashes (N = 2^14, r = 16, p = 1) are still accepted and
// replaced at the owner's next password sign in.

interface ScryptParameters {
	logN: number;
	r: number;
	p: number;
}

const PARAMETERS: ScryptParameters = { logN: 15, r: 8, p: 3 };
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const MAX_MEMORY_BYTES = 256 * 1024 * 1024;

const HASH_PATTERN =
	/^\$scrypt\$ln=(\d{1,2}),r=(\d{1,2}),p=(\d{1,2})\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;
const LEGACY_HASH_PATTERN = /^[0-9a-f]+:[0-9a-f]+$/;

/** Bounds for parameters read from a stored hash, so a tampered hash cannot exhaust memory. */
const LIMITS = {
	logN: { min: 10, max: 20 },
	r: { min: 1, max: 32 },
	p: { min: 1, max: 16 }
} as const;

function deriveKey(
	password: string,
	salt: Buffer,
	parameters: ScryptParameters,
	length: number
): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		scrypt(
			password.normalize('NFKC'),
			salt,
			length,
			{ N: 2 ** parameters.logN, r: parameters.r, p: parameters.p, maxmem: MAX_MEMORY_BYTES },
			(error, key) => {
				if (error) {
					reject(error);
				} else {
					resolve(key);
				}
			}
		);
	});
}

function prefix(parameters: ScryptParameters): string {
	return `$scrypt$ln=${parameters.logN},r=${parameters.r},p=${parameters.p}`;
}

function unpadded(value: Buffer): string {
	return value.toString('base64').replace(/=+$/, '');
}

function withinLimits(parameters: ScryptParameters): boolean {
	return (Object.keys(LIMITS) as (keyof ScryptParameters)[]).every(
		(name) => parameters[name] >= LIMITS[name].min && parameters[name] <= LIMITS[name].max
	);
}

export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(SALT_LENGTH);
	const key = await deriveKey(password, salt, PARAMETERS, KEY_LENGTH);
	return [prefix(PARAMETERS), unpadded(salt), unpadded(key)].join('$');
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
	const match = HASH_PATTERN.exec(hash);
	if (match === null) {
		if (!LEGACY_HASH_PATTERN.test(hash)) {
			return false;
		}
		return verifyLegacyPassword({ hash, password });
	}
	const parameters: ScryptParameters = {
		logN: Number(match[1]),
		r: Number(match[2]),
		p: Number(match[3])
	};
	if (!withinLimits(parameters)) {
		return false;
	}
	const expected = Buffer.from(match[5], 'base64');
	const actual = await deriveKey(
		password,
		Buffer.from(match[4], 'base64'),
		parameters,
		expected.length
	);
	return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Whether a stored hash uses other parameters than today's and should be replaced. */
export function passwordHashNeedsUpgrade(hash: string): boolean {
	return !hash.startsWith(`${prefix(PARAMETERS)}$`);
}
