import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ownerActor, SYSTEM_ACTOR } from './actor';
import { listAuditEvents, purgeAuditEvents, recordAudit } from './audit';
import { getDb } from './db';
import { auditEvent, session, twoFactor, user, userSetting } from './db/schema';
import { disableOwnerTwoFactor, findOwner } from './owner';
import { listSessions, revokeOtherSessions, revokeSession } from './sessions';
import { isSteppedUp, recordStepUp, STEP_UP_WINDOW_MS } from './step-up';
import { getUserSettings, preferredLocale, saveUserSettings } from './user-settings';

const DAY = 24 * 60 * 60 * 1000;

let ownerId = '';

async function addSession(userAgent: string, updatedAt = new Date()): Promise<string> {
	const id = randomUUID();
	await getDb()
		.insert(session)
		.values({
			id,
			token: randomUUID(),
			userId: ownerId,
			expiresAt: new Date(Date.now() + DAY),
			ipAddress: '10.0.0.1',
			userAgent,
			createdAt: updatedAt,
			updatedAt
		});
	return id;
}

beforeEach(async () => {
	const owner = await findOwner(getDb());
	ownerId = owner?.id ?? '';
	await getDb().delete(auditEvent);
	await getDb().delete(session).where(eq(session.userId, ownerId));
	await getDb().delete(userSetting);
});

afterEach(async () => {
	await getDb().update(user).set({ twoFactorEnabled: false }).where(eq(user.id, ownerId));
	await getDb().delete(twoFactor);
});

describe('audit log', () => {
	it('filters by actor, action prefix and time, newest first, in pages', async () => {
		const base = new Date('2026-05-01T12:00:00Z');
		const at = (days: number) => new Date(base.getTime() + days * DAY);
		await recordAudit({ actor: ownerActor(ownerId), action: 'auth.sign_in', now: at(0) });
		await recordAudit({ actor: SYSTEM_ACTOR, action: 'auth.sign_in_failed', now: at(1) });
		await recordAudit({
			actor: ownerActor(ownerId),
			action: 'auth.session_revoke',
			target: { type: 'session', id: 'abc' },
			metadata: { count: 1 },
			origin: { ip: '10.0.0.9', userAgent: 'Firefox/130' },
			now: at(2)
		});
		await recordAudit({
			actor: { type: 'cli', id: null },
			action: 'database.migrate',
			now: at(3)
		});

		const all = await listAuditEvents();
		expect(all.total).toBe(4);
		expect(all.events.map((event) => event.action)).toEqual([
			'database.migrate',
			'auth.session_revoke',
			'auth.sign_in_failed',
			'auth.sign_in'
		]);
		expect(all.events[1]).toMatchObject({
			actorType: 'owner',
			targetType: 'session',
			targetId: 'abc',
			ip: '10.0.0.9',
			metadata: { count: 1 }
		});

		expect((await listAuditEvents({ actorType: 'owner' })).total).toBe(2);
		expect((await listAuditEvents({ actionPrefix: 'auth.sign_in' })).total).toBe(2);
		expect((await listAuditEvents({ actionPrefix: 'auth.%' })).total).toBe(0);
		expect((await listAuditEvents({ from: at(1), to: at(2) })).total).toBe(2);
	});

	it('pages fifty events at a time', async () => {
		for (let index = 0; index < 55; index += 1) {
			await recordAudit({ actor: SYSTEM_ACTOR, action: `test.event_${index}` });
		}
		expect((await listAuditEvents({ page: 1 })).events).toHaveLength(50);
		expect((await listAuditEvents({ page: 2 })).events).toHaveLength(5);
	});

	it('purges events older than the retention period', async () => {
		const now = new Date('2026-09-01T00:00:00Z');
		await recordAudit({
			actor: SYSTEM_ACTOR,
			action: 'test.old',
			now: new Date(now.getTime() - 181 * DAY)
		});
		await recordAudit({
			actor: SYSTEM_ACTOR,
			action: 'test.recent',
			now: new Date(now.getTime() - 179 * DAY)
		});

		expect(await purgeAuditEvents(now, 180)).toBe(1);
		expect((await listAuditEvents()).events.map((event) => event.action)).toEqual([
			'test.recent'
		]);
	});
});

describe('step-up', () => {
	it('lasts ten minutes in the session that confirmed it', async () => {
		const sessionId = await addSession('Chrome/130');
		const other = await addSession('Firefox/130');
		const start = new Date();

		expect(await isSteppedUp(sessionId, start)).toBe(false);
		await recordStepUp(sessionId, start);
		expect(await isSteppedUp(sessionId, new Date(start.getTime() + 60_000))).toBe(true);
		expect(await isSteppedUp(other, start)).toBe(false);
		expect(await isSteppedUp(sessionId, new Date(start.getTime() + STEP_UP_WINDOW_MS))).toBe(
			false
		);
	});

	it('goes with its session', async () => {
		const sessionId = await addSession('Chrome/130');
		await recordStepUp(sessionId);
		await revokeSession(ownerId, sessionId);
		expect(await isSteppedUp(sessionId)).toBe(false);
	});
});

describe('sessions', () => {
	it('lists sessions by last activity with a device summary, and revokes them', async () => {
		const now = Date.now();
		const current = await addSession(
			'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36',
			new Date(now - 1000)
		);
		const phone = await addSession(
			'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1',
			new Date(now)
		);
		const laptop = await addSession(
			'Mozilla/5.0 (X11; Linux x86_64) Firefox/130.0',
			new Date(now - 5000)
		);

		const listed = await listSessions(ownerId, current);
		expect(listed.map((item) => [item.id, item.current, item.browser, item.os])).toEqual([
			[phone, false, 'Safari', 'iOS'],
			[current, true, 'Chrome', 'Windows'],
			[laptop, false, 'Firefox', 'Linux']
		]);

		expect(await revokeSession(ownerId, phone)).toBe(true);
		expect(await revokeSession(ownerId, phone)).toBe(false);
		expect(await revokeOtherSessions(ownerId, current)).toBe(1);
		expect((await listSessions(ownerId, current)).map((item) => item.id)).toEqual([current]);
	});
});

describe('user settings', () => {
	it('stores the preferred locale and default theme', async () => {
		expect(await getUserSettings(ownerId)).toEqual({ locale: null, theme: null });
		expect(await preferredLocale()).toBe('en');

		await saveUserSettings(ownerId, { locale: 'tr', theme: 'dark' });
		expect(await getUserSettings(ownerId)).toEqual({ locale: 'tr', theme: 'dark' });
		expect(await preferredLocale()).toBe('tr');

		await saveUserSettings(ownerId, { locale: null, theme: 'light' });
		const [row] = await getDb()
			.select()
			.from(userSetting)
			.where(eq(userSetting.userId, ownerId));
		expect(row).toMatchObject({ locale: null, theme: 'light' });
	});
});

describe('lockout recovery', () => {
	it('turns two factor off and signs out every session', async () => {
		await getDb().update(user).set({ twoFactorEnabled: true }).where(eq(user.id, ownerId));
		await getDb().insert(twoFactor).values({
			id: randomUUID(),
			secret: 'encrypted',
			backupCodes: 'encrypted',
			userId: ownerId
		});
		await addSession('Chrome/130');

		const result = await disableOwnerTwoFactor(getDb());
		expect(result.wasEnabled).toBe(true);

		const [owner] = await getDb().select().from(user).where(eq(user.id, ownerId));
		expect(owner.twoFactorEnabled).toBe(false);
		expect(await getDb().select().from(twoFactor)).toHaveLength(0);
		expect(
			await getDb().select().from(session).where(eq(session.userId, ownerId))
		).toHaveLength(0);
	});
});
