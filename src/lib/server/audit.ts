import type { RequestEvent } from '@sveltejs/kit';
import { and, count, desc, eq, gte, like, lt, lte, sql, type SQL } from 'drizzle-orm';
import type { Actor, ActorType } from './actor';
import { getDb, type Database } from './db';
import { auditEvent } from './db/schema';
import type { AuditEventView } from '$lib/types/security';
import { log } from './log';

// The audit log: security events, writes from outside the browser and CLI changes. Metadata must
// never carry secrets: no passwords, codes, keys, tokens or vault values.

const DAY_MS = 24 * 60 * 60 * 1000;

/** The longest user agent kept; anything longer is cut, it only needs to identify a device. */
const USER_AGENT_MAX_LENGTH = 512;

export const AUDIT_PAGE_SIZE = 50;

export interface AuditOrigin {
	ip: string | null;
	userAgent: string | null;
}

export interface AuditEntry {
	actor: Actor;
	/** Dotted, for example `auth.sign_in` or `note.update`. */
	action: string;
	target?: { type: string; id: string };
	metadata?: Record<string, unknown>;
	origin?: AuditOrigin;
	now?: Date;
}

export interface AuditFilter {
	actorType?: ActorType;
	/** Matches actions that start with it, such as `auth.`. */
	actionPrefix?: string;
	from?: Date;
	/** Inclusive: events up to the end of this moment. */
	to?: Date;
	/** One based. */
	page?: number;
}

export function originOf(event: RequestEvent): AuditOrigin {
	let ip: string | null = null;
	try {
		ip = event.getClientAddress();
	} catch {
		// Requests built in tests or by the server itself have no client address.
	}
	const userAgent = event.request.headers.get('user-agent');
	return { ip, userAgent: userAgent?.slice(0, USER_AGENT_MAX_LENGTH) ?? null };
}

/**
 * Writes one event. A failure is logged and swallowed: the audit log must never be the reason a
 * sign in or a save fails.
 */
export async function recordAudit(entry: AuditEntry, db: Database = getDb()): Promise<void> {
	try {
		await db.insert(auditEvent).values({
			occurredAt: entry.now ?? new Date(),
			actorType: entry.actor.type,
			actorId: entry.actor.id,
			action: entry.action,
			targetType: entry.target?.type ?? null,
			targetId: entry.target?.id ?? null,
			ip: entry.origin?.ip ?? null,
			userAgent: entry.origin?.userAgent ?? null,
			metadata: entry.metadata ?? {}
		});
		// Mirrored to the log, so the events also reach a system outside the database.
		log('info', 'Audit event', {
			action: entry.action,
			actorType: entry.actor.type,
			actorId: entry.actor.id,
			targetType: entry.target?.type,
			targetId: entry.target?.id,
			ip: entry.origin?.ip
		});
	} catch (error) {
		log('error', 'Recording an audit event failed', { action: entry.action }, error);
	}
}

function escapeLike(value: string): string {
	return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export async function listAuditEvents(
	filter: AuditFilter = {}
): Promise<{ events: AuditEventView[]; total: number }> {
	const conditions: SQL[] = [];
	if (filter.actorType !== undefined) {
		conditions.push(eq(auditEvent.actorType, filter.actorType));
	}
	const prefix = filter.actionPrefix?.trim() ?? '';
	if (prefix.length > 0) {
		conditions.push(like(auditEvent.action, `${escapeLike(prefix)}%`));
	}
	if (filter.from !== undefined) {
		conditions.push(gte(auditEvent.occurredAt, filter.from));
	}
	if (filter.to !== undefined) {
		conditions.push(lte(auditEvent.occurredAt, filter.to));
	}
	const where = conditions.length > 0 ? and(...conditions) : undefined;
	const page = Math.max(1, filter.page ?? 1);

	const db = getDb();
	const [{ total }] = await db.select({ total: count() }).from(auditEvent).where(where);
	const events = await db
		.select({
			id: auditEvent.id,
			occurredAt: auditEvent.occurredAt,
			actorType: auditEvent.actorType,
			actorId: auditEvent.actorId,
			action: auditEvent.action,
			targetType: auditEvent.targetType,
			targetId: auditEvent.targetId,
			ip: auditEvent.ip,
			userAgent: auditEvent.userAgent,
			metadata: auditEvent.metadata
		})
		.from(auditEvent)
		.where(where)
		.orderBy(desc(auditEvent.occurredAt), desc(auditEvent.id))
		.limit(AUDIT_PAGE_SIZE)
		.offset((page - 1) * AUDIT_PAGE_SIZE);
	return { events, total };
}

/**
 * Deletes events older than the retention period. The audit table refuses deletes unless the
 * transaction sets `manifold.audit_purge` (migration 0012), which only this function does.
 */
export async function purgeAuditEvents(now: Date, retentionDays: number): Promise<number> {
	const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
	return getDb().transaction(async (tx) => {
		await tx.execute(sql`select set_config('manifold.audit_purge', 'on', true)`);
		const deleted = await tx
			.delete(auditEvent)
			.where(lt(auditEvent.occurredAt, cutoff))
			.returning({ id: auditEvent.id });
		return deleted.length;
	});
}
