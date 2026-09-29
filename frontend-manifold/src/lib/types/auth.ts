import type { FieldErrors } from './validation';

export type LoginMethod = 'password' | 'code';

/** The second step of a sign in with two factor authentication. */
export type SecondFactor = 'totp' | 'backup';

export interface LoginFormState {
	method: LoginMethod;
	/** The username or email typed for a password sign in, the email for a code sign in. */
	identifier: string;
	sent: boolean;
	/** The first factor was accepted and a TOTP or backup code is due. */
	twoFactor: boolean;
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
