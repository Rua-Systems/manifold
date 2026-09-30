import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationStore } from './notifications.svelte';

describe('NotificationStore', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('adds notifications with their kind', () => {
		const store = new NotificationStore();
		store.notice('first');
		store.fault('second');

		expect(store.items.map((item) => item.kind)).toEqual(['notice', 'fault']);
	});

	it('dismisses a notification after its duration', () => {
		const store = new NotificationStore();
		store.confirm('saved', 1000);

		vi.advanceTimersByTime(999);
		expect(store.items).toHaveLength(1);

		vi.advanceTimersByTime(1);
		expect(store.items).toHaveLength(0);
	});

	it('keeps notifications without a duration until dismissed', () => {
		const store = new NotificationStore();
		const id = store.notice('sticky', 0);

		vi.advanceTimersByTime(60_000);
		expect(store.items).toHaveLength(1);

		store.dismiss(id);
		expect(store.items).toHaveLength(0);
	});

	it('drops the oldest notification beyond the visible limit', () => {
		const store = new NotificationStore();
		for (const message of ['one', 'two', 'three', 'four', 'five']) {
			store.notice(message);
		}

		expect(store.items.map((item) => item.message)).toEqual(['two', 'three', 'four', 'five']);
	});
});
