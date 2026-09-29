import type { FieldErrors } from './validation';

export type LoginMethod = 'password' | 'code';

export interface LoginFormState {
	method: LoginMethod;
	/** The username or email typed for a password sign in, the email for a code sign in. */
	identifier: string;
	sent: boolean;
	message: string;
	errors: FieldErrors;
}

export type ResetStage = 'request' | 'verify';

export interface ResetFormState {
	stage: ResetStage;
	email: string;
	message: string;
	errors: FieldErrors;
}
