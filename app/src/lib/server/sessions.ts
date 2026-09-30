import { summarizeUserAgent } from '$lib/utils/user-agent';
import { and, desc, eq, gt, ne } from 'drizzle-orm';
import { getDb } from './db';
import { session } from './db/schema';
import type { SessionView } from '$lib/types/security';

// The owner's sessions as Settings shows them. Tokens never leave the server: sessions are named
// by their id, and revoking deletes the row, which ends the session on its next request.

export async function listSessions(
	userId: string,
	currentSessionId: string,
	now = new Date()
): Promise<SessionView[]> {
	const rows = await getDb()
		.select({
			id: session.id,
			ip: session.ipAddress,
			userAgent: session.userAgent,
			createdAt: session.createdAt,
			updatedAt: session.updatedAt
		})
		.from(session)
		.where(and(eq(session.userId, userId), gt(session.expiresAt, now)))
		.orderBy(desc(session.updatedAt));
	return rows.map((row) => ({
		id: row.id,
		current: row.id === currentSessionId,
		...summarizeUserAgent(row.userAgent),
		ip: row.ip,
		createdAt: row.createdAt,
		lastActiveAt: row.updatedAt
	}));
}

/** Signs out one of the owner's sessions. Reports whether it existed. */
export async function revokeSession(userId: string, sessionId: string): Promise<boolean> {
	const deleted = await getDb()
		.delete(session)
		.where(and(eq(session.id, sessionId), eq(session.userId, userId)))
		.returning({ id: session.id });
	return deleted.length > 0;
}

/** Signs out every session but the current one and reports how many there were. */
export async function revokeOtherSessions(
	userId: string,
	currentSessionId: string
): Promise<number> {
	const deleted = await getDb()
		.delete(session)
		.where(and(eq(session.userId, userId), ne(session.id, currentSessionId)))
		.returning({ id: session.id });
	return deleted.length;
}
