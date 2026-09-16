import type { Validator } from '$lib/types/validation';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DIGITS_PATTERN = /^\d+$/;

export function required(message = 'This field is required.'): Validator {
	return (value) => {
		if (value.trim().length === 0) {
			return message;
		}
		return null;
	};
}

export function email(message = 'Enter a valid email address.'): Validator {
	return (value) => {
		if (value.trim().length === 0) {
			return null;
		}
		if (!EMAIL_PATTERN.test(value.trim())) {
			return message;
		}
		return null;
	};
}

export function minLength(length: number, message = ''): Validator {
	return (value) => {
		if (value.length === 0) {
			return null;
		}
		if (value.length >= length) {
			return null;
		}
		if (message.length > 0) {
			return message;
		}
		return `Must be at least ${length} characters.`;
	};
}

export function digits(length: number, message = ''): Validator {
	return (value) => {
		const trimmed = value.trim();
		if (trimmed.length === 0) {
			return null;
		}
		if (DIGITS_PATTERN.test(trimmed) && trimmed.length === length) {
			return null;
		}
		if (message.length > 0) {
			return message;
		}
		return `Enter the ${length} digit code.`;
	};
}
