import type { AuthSession, AuthUser } from '#lib/server/auth.ts';
import type { Features } from '#lib/types/features.ts';
import type { Theme } from '#lib/types/theme.ts';
import type { SessionUser } from '#lib/types/user.ts';

declare global {
	namespace App {
		interface Error {
			message: string;
			/** Quoted in the log line of an unexpected error. */
			id?: string;
		}

		interface Locals {
			user: AuthUser | null;
			session: AuthSession | null;
			theme: Theme | null;
		}

		interface PageData {
			user: SessionUser | null;
			theme: Theme | null;
			organizationName: string;
			features: Features;
		}
	}
}

export {};
