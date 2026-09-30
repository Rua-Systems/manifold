import longCommonPasswords from './common-passwords-long.txt?raw';
import commonPasswords from './common-passwords.txt?raw';
import { PASSWORD_MIN_LENGTH } from '$lib/schemas/rules';

// New passwords are checked on the server against common and breached passwords and against
// words an attacker would try first. The lists come from SecLists (MIT, see
// common-passwords.license.txt): the 10,000 most common passwords, and the entries of 12 to 128
// characters of the million most common. Server only, so the lists never reach a browser.

/** Why a new password is refused, or null when it is fine. */
export type PasswordProblem = 'common' | 'context';

/** Names that belong to this installation and account. */
export interface PasswordContext {
	username?: string | null;
	email?: string | null;
	organizationName?: string | null;
}

/** Context words shorter than this are too likely to appear in a good password by chance. */
const CONTEXT_WORD_MIN_LENGTH = 4;

const PRODUCT_WORDS = ['manifold'];

let known: Set<string> | undefined;

function commonPasswordSet(): Set<string> {
	if (known === undefined) {
		known = new Set();
		for (const list of [commonPasswords, longCommonPasswords]) {
			for (const line of list.split('\n')) {
				const entry = line.trim().toLowerCase();
				if (entry.length >= PASSWORD_MIN_LENGTH) {
					known.add(entry);
				}
			}
		}
	}
	return known;
}

function contextWords(context: PasswordContext): string[] {
	const words = [...PRODUCT_WORDS];
	if (context.username) {
		words.push(context.username);
	}
	if (context.email) {
		words.push(context.email, context.email.split('@', 1)[0]);
	}
	if (context.organizationName) {
		words.push(context.organizationName, ...context.organizationName.split(/\s+/));
	}
	return words
		.map((word) => word.trim().toLowerCase())
		.filter((word) => word.length >= CONTEXT_WORD_MIN_LENGTH);
}

/** Checks a new password; the length rules are checked elsewhere. */
export function passwordProblem(
	password: string,
	context: PasswordContext
): PasswordProblem | null {
	const lowered = password.toLowerCase();
	if (commonPasswordSet().has(lowered)) {
		return 'common';
	}
	if (contextWords(context).some((word) => lowered.includes(word))) {
		return 'context';
	}
	return null;
}
