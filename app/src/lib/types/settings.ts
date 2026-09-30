import type { FieldErrors } from './validation';

export type SettingsForm = 'profile' | 'preferences' | 'email' | 'password';

export interface SettingsFormState {
	form: SettingsForm;
	success: boolean;
	message: string;
	errors: FieldErrors;
	/** The action needs a recent step-up first. */
	stepUp?: boolean;
}
