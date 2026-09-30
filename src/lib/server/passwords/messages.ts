import { m } from '$lib/paraglide/messages.js';
import type { PasswordProblem } from './policy';

/** The message a form shows for a refused new password. Apart from policy.ts, which the CLI uses. */
export function passwordProblemMessage(problem: PasswordProblem): string {
	if (problem === 'common') {
		return m.validation_password_common();
	}
	return m.validation_password_context();
}
