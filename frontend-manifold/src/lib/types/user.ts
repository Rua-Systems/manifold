import type { User } from 'better-auth';

export type SessionUser = Pick<User, 'name' | 'email'>;
