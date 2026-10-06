import { addFeature } from '$lib/modules/notes/map/features.server';
import { createNote, trashNote } from '$lib/modules/notes/notes.server';
import { note } from '$lib/modules/notes/schema.server';
import { createNoteToken } from '$lib/modules/notes/tokens.server';
import { service } from '$lib/modules/services/schema.server';
import { createService } from '$lib/modules/services/services.server';
import type { DashboardBlock, DashboardCard, DashboardStat } from '$lib/types/dashboard';
import { beforeEach, describe, expect, it } from 'vitest';
import { ownerActor, SYSTEM_ACTOR } from './actor';
import { createApiKey, revokeApiKey } from './api-keys';
import { purgeAuditEvents, recordAudit } from './audit';
import { loadDashboard } from './dashboard';
import { getDb } from './db';
import { apiKey } from './db/schema';

const OWNER = ownerActor('owner-1');

function card(cards: DashboardCard[], id: string): DashboardCard {
	const found = cards.find((item) => item.id === id);
	if (found === undefined) {
		throw new Error(`No card ${id}.`);
	}
	return found;
}

function block<K extends DashboardBlock['kind']>(
	from: DashboardCard,
	kind: K
): Extract<DashboardBlock, { kind: K }> {
	const found = from.blocks.find((item) => item.kind === kind);
	if (found === undefined) {
		throw new Error(`No ${kind} block on ${from.id}.`);
	}
	return found as Extract<DashboardBlock, { kind: K }>;
}

function stat(from: DashboardCard, id: string): DashboardStat | undefined {
	return block(from, 'stats').stats.find((item) => item.id === id);
}

beforeEach(async () => {
	await getDb().delete(note);
	await getDb().delete(service);
	await getDb().delete(apiKey);
	await purgeAuditEvents(new Date(Date.now() + 60_000), 0);
});

describe('dashboard', () => {
	it('shows the modules in sidebar order, then access and usage', async () => {
		const { cards } = await loadDashboard();
		expect(cards.map((item) => item.id)).toEqual([
			'services',
			'notes',
			'map',
			'access',
			'usage'
		]);
		expect(cards.map((item) => item.id)).not.toContain('vault');
	});

	it('counts notes, edits per day, recent notes and map features', async () => {
		const kept = await createNote({ title: 'Kept' }, OWNER);
		const trashed = await createNote({ title: 'Trashed' }, OWNER);
		await addFeature(kept.id, { type: 'Point', coordinates: [28.97, 41.0] });
		await addFeature(kept.id, { type: 'Point', coordinates: [29.0, 41.1] });
		await addFeature(trashed.id, { type: 'Point', coordinates: [29.1, 41.2] });
		await trashNote(trashed.id);

		const now = new Date();
		const { cards } = await loadDashboard(now);
		const notes = card(cards, 'notes');
		expect(stat(notes, 'notes')?.value).toBe(1);
		expect(stat(notes, 'edited')?.value).toBe(1);
		expect(stat(notes, 'trash')?.value).toBe(1);

		const edits = block(notes, 'days');
		expect(edits.days).toHaveLength(30);
		expect(edits.days.at(-1)).toEqual({ day: now.toISOString().slice(0, 10), value: 2 });
		expect(block(notes, 'links').links.map((link) => link.label)).toEqual(['Kept']);

		const map = card(cards, 'map');
		expect(stat(map, 'point')?.value).toBe(2);
		expect(stat(map, 'line')?.value).toBe(0);
	});

	it('lists services as shortcuts with their addresses', async () => {
		await createService({ alias: 'Grafana', url: 'https://grafana.example.com' });
		const { cards } = await loadDashboard();
		const services = card(cards, 'services');
		expect(stat(services, 'services')?.value).toBe(1);
		expect(block(services, 'links').links).toEqual([
			expect.objectContaining({
				label: 'Grafana',
				href: 'https://grafana.example.com',
				external: true
			})
		]);
	});

	it('counts working keys and tokens, failed sign ins per day and the latest events', async () => {
		const working = await createApiKey({
			name: 'Working',
			scopes: ['notes:read'],
			expiresAt: null
		});
		const revoked = await createApiKey({
			name: 'Revoked',
			scopes: ['notes:read'],
			expiresAt: null
		});
		await revokeApiKey(revoked.view.id);
		const shared = await createNote({ title: 'Shared' }, OWNER);
		await createNoteToken({
			noteId: shared.id,
			name: 'Reader',
			access: 'read',
			expiresAt: new Date(Date.now() + 60 * 60 * 1000)
		});
		for (let index = 0; index < 3; index += 1) {
			await recordAudit({ actor: SYSTEM_ACTOR, action: 'auth.sign_in_failed' });
		}
		// A moment later, so it is the newest event whatever the clock's resolution.
		const now = new Date(Date.now() + 1000);
		await recordAudit({
			actor: OWNER,
			action: 'api_key.create',
			target: { type: 'api_key', id: working.view.id },
			now
		});

		const { cards } = await loadDashboard(now);
		const access = card(cards, 'access');
		expect(stat(access, 'api_keys')?.value).toBe(1);
		expect(stat(access, 'note_tokens')?.value).toBe(1);

		const failures = block(access, 'days');
		expect(failures.days).toHaveLength(7);
		expect(failures.days.at(-1)?.value).toBe(3);

		const [latest] = block(access, 'links').links;
		expect(latest).toMatchObject({ label: 'Owner', code: 'api_key.create' });
	});

	it('sums up usage without sizing every table', async () => {
		const { cards } = await loadDashboard();
		const usage = card(cards, 'usage');
		expect(stat(usage, 'database')?.value).toBeGreaterThan(0);
		expect(stat(usage, 'memory')?.unit).toBe('bytes');
	});
});
