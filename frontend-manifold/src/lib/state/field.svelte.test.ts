import { describe, expect, it } from 'vitest';
import { Field, validateAll } from './field.svelte';

function required(value: string): string | null {
	if (value.trim().length === 0) {
		return 'required';
	}
	return null;
}

describe('Field', () => {
	it('hides errors until touched', () => {
		const field = new Field([required]);

		expect(field.invalid).toBe(true);
		expect(field.showError).toBe(false);
		expect(field.message).toBe('');

		field.markTouched();
		expect(field.message).toBe('required');
	});

	it('clears the visible error without losing the value', () => {
		const field = new Field([required], 'kept');
		field.value = '';
		field.markTouched();

		field.clearError();
		expect(field.showError).toBe(false);
		expect(field.value).toBe('');
	});
});

describe('validateAll', () => {
	it('touches every field and reports whether all are valid', () => {
		const filled = new Field([required], 'value');
		const empty = new Field([required]);

		expect(validateAll([filled, empty])).toBe(false);
		expect(filled.touched).toBe(true);
		expect(empty.showError).toBe(true);
	});
});
