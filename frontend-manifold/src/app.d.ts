import type { Theme } from '$lib/types/theme';
import type { SessionUser } from '$lib/types/user';
import type { Session, User } from 'better-auth';

declare global {
	namespace App {
		interface Locals {
			user: User | null;
			session: Session | null;
			theme: Theme | null;
		}

		interface PageData {
			user: SessionUser | null;
			theme: Theme | null;
		}
	}
}

export {};
