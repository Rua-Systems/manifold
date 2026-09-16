import type { SessionUser } from '$lib/types/user';
import { dev } from '$app/environment';

const CODE_LENGTH = 6;
const DIGITS_PATTERN = /^\d+$/;

function placeholderUser(email: string): SessionUser {
	const trimmed = email.trim();
	const [name] = trimmed.split('@');

	return { email: trimmed, name };
}

export function verifyPassword(email: string, password: string): SessionUser | null {
	if (!dev) {
		return null;
	}
	if (email.trim().length === 0 || password.length === 0) {
		return null;
	}
	return placeholderUser(email);
}

export function issueLoginCode(email: string): boolean {
	if (!dev) {
		return false;
	}
	return email.trim().length > 0;
}

export function verifyLoginCode(email: string, code: string): SessionUser | null {
	if (!dev) {
		return null;
	}

	const trimmed = code.trim();
	if (trimmed.length !== CODE_LENGTH || !DIGITS_PATTERN.test(trimmed)) {
		return null;
	}
	return placeholderUser(email);
}
