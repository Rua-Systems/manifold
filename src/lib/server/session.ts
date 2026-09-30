import type { SessionUser } from '$lib/types/user';

interface SessionUserSource {
	name: string;
	email: string;
	username?: string | null;
	twoFactorEnabled?: boolean | null;
}

/** Only these fields reach the browser; the full Better Auth user stays on the server. */
export function toSessionUser(user: SessionUserSource | null): SessionUser | null {
	if (user === null) {
		return null;
	}
	return {
		name: user.name,
		email: user.email,
		username: user.username ?? null,
		twoFactorEnabled: user.twoFactorEnabled === true
	};
}
