import type { FieldErrors } from './validation';

export type SettingsForm = 'profile' | 'email' | 'password';

export interface SettingsFormState {
	form: SettingsForm;
	success: boolean;
	message: string;
	errors: FieldErrors;
}
