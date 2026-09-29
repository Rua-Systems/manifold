import { and, eq, ne } from 'drizzle-orm';
import { getDb } from './db';
import { user } from './db/schema';

export type EmailChangeResult = 'changed' | 'taken';

/**
 * Changes the owner's email directly. There is no confirmation mail: this is a single owner app and
 * the change must work without SMTP. The address stays marked verified, because the email code
 * plugin strips the password from accounts whose address is unverified.
 */
export async function changeEmail(userId: string, email: string): Promise<EmailChangeResult> {
	const normalized = email.trim().toLowerCase();
	const db = getDb();

	const [taken] = await db
		.select({ id: user.id })
		.from(user)
		.where(and(eq(user.email, normalized), ne(user.id, userId)))
		.limit(1);
	if (taken !== undefined) {
		return 'taken';
	}

	await db
		.update(user)
		.set({ email: normalized, emailVerified: true, updatedAt: new Date() })
		.where(eq(user.id, userId));
	return 'changed';
}
