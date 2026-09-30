import type { Validator } from '$lib/types/validation';

export class Field {
	value = $state('');
	touched = $state(false);

	private validators: Validator[];

	constructor(validators: Validator[] = [], initial = '') {
		this.validators = validators;
		this.value = initial;
	}

	get error(): string | null {
		for (const validate of this.validators) {
			const message = validate(this.value);
			if (message !== null) {
				return message;
			}
		}
		return null;
	}

	get invalid(): boolean {
		return this.error !== null;
	}

	get showError(): boolean {
		return this.touched && this.error !== null;
	}

	get message(): string {
		if (!this.showError) {
			return '';
		}
		return this.error ?? '';
	}

	markTouched(): void {
		this.touched = true;
	}

	clearError(): void {
		this.touched = false;
	}

	reset(): void {
		this.value = '';
		this.touched = false;
	}
}

export function validateAll(fields: Field[]): boolean {
	let valid = true;

	for (const field of fields) {
		field.markTouched();
		if (field.invalid) {
			valid = false;
		}
	}
	return valid;
}
