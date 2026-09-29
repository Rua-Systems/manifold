import type { SessionUser } from '$lib/types/user';
import type { User } from 'better-auth';

/** Only these fields reach the browser; the full Better Auth user stays on the server. */
export function toSessionUser(user: User | null): SessionUser | null {
	if (user === null) {
		return null;
	}
	return { name: user.name, email: user.email };
}
