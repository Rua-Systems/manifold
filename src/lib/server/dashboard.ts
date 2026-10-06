import { moduleDashboardCards } from '$lib/modules/registry.server';
import { m } from '$lib/paraglide/messages.js';
import type { Dashboard, DashboardCard } from '$lib/types/dashboard';
import { fillDays, startOfLastDays } from '$lib/utils/days';
import { and, count, desc, eq, gt, gte, isNull, or, sql } from 'drizzle-orm';
import type { ActorType } from './actor';
import { credentialSummaries } from './api/credentials';
import { getDb } from './db';
import { apiKey, auditEvent, session } from './db/schema';
import { usageSummary } from './usage/report';

// The dashboard: the modules' cards in sidebar order, then the core's cards on access and usage.

const FAILED_SIGN_IN_DAYS = 7;
const RECENT_EVENTS = 6;

const ACTOR_LABELS: Record<ActorType, () => string> = {
	owner: m.security_actor_owner,
	api_key: m.security_actor_api_key,
	note_token: m.security_actor_note_token,
	cli: m.security_actor_cli,
	system: m.security_actor_system
};

async function failedSignInsPerDay(now: Date) {
	const day = sql<string>`to_char(${auditEvent.occurredAt} at time zone 'UTC', 'YYYY-MM-DD')`;
	const rows = await getDb()
		.select({ day, count: count() })
		.from(auditEvent)
		.where(
			and(
				eq(auditEvent.action, 'auth.sign_in_failed'),
				gte(auditEvent.occurredAt, startOfLastDays(FAILED_SIGN_IN_DAYS, now))
			)
		)
		.groupBy(day);
	return fillDays(rows, FAILED_SIGN_IN_DAYS, now);
}

/** Signed in browsers, working API keys and module tokens, failed sign ins and the latest events. */
async function accessCard(now: Date): Promise<DashboardCard> {
	const [[sessions], [keys], tokens, failures, events] = await Promise.all([
		getDb().select({ value: count() }).from(session).where(gt(session.expiresAt, now)),
		getDb()
			.select({ value: count() })
			.from(apiKey)
			.where(
				and(
					isNull(apiKey.revokedAt),
					or(isNull(apiKey.expiresAt), gt(apiKey.expiresAt, now))
				)
			),
		credentialSummaries(),
		failedSignInsPerDay(now),
		getDb()
			.select({
				id: auditEvent.id,
				action: auditEvent.action,
				actorType: auditEvent.actorType,
				occurredAt: auditEvent.occurredAt
			})
			.from(auditEvent)
			.orderBy(desc(auditEvent.occurredAt))
			.limit(RECENT_EVENTS)
	]);
	return {
		id: 'access',
		title: m.dashboard_access(),
		href: '/settings/security',
		blocks: [
			{
				kind: 'stats',
				stats: [
					{
						id: 'sessions',
						label: m.dashboard_sessions(),
						value: sessions.value,
						unit: 'count'
					},
					{
						id: 'api_keys',
						label: m.dashboard_api_keys(),
						value: keys.value,
						unit: 'count'
					},
					...tokens
				]
			},
			{
				kind: 'days',
				id: 'failed_sign_ins',
				title: m.dashboard_failed_sign_ins(),
				days: failures
			},
			{
				kind: 'links',
				id: 'events',
				title: m.dashboard_events(),
				empty: m.security_audit_empty(),
				links: events.map((event) => ({
					id: event.id,
					label: ACTOR_LABELS[event.actorType](),
					code: event.action,
					href: '/settings/security',
					external: false,
					time: event.occurredAt
				}))
			}
		]
	};
}

async function usageCard(): Promise<DashboardCard> {
	const summary = await usageSummary();
	const stats = [
		{
			id: 'database',
			label: m.usage_database(),
			value: summary.databaseBytes,
			unit: 'bytes' as const
		},
		{
			id: 'uploads',
			label: m.usage_files(),
			value: summary.uploadBytes,
			unit: 'bytes' as const
		},
		{ id: 'memory', label: m.usage_memory(), value: summary.rssBytes, unit: 'bytes' as const }
	];
	if (summary.diskFreeBytes !== null) {
		stats.splice(2, 0, {
			id: 'disk_free',
			label: m.usage_disk(),
			value: summary.diskFreeBytes,
			unit: 'bytes'
		});
	}
	return {
		id: 'usage',
		title: m.usage_title(),
		href: '/settings/usage',
		blocks: [{ kind: 'stats', stats }]
	};
}

export async function loadDashboard(now = new Date()): Promise<Dashboard> {
	const [modules, access, usage] = await Promise.all([
		moduleDashboardCards(),
		accessCard(now),
		usageCard()
	]);
	return { generatedAt: now, cards: [...modules, access, usage] };
}
