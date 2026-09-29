export interface SessionUser {
	name: string;
	email: string;
	username: string | null;
	twoFactorEnabled: boolean;
}
