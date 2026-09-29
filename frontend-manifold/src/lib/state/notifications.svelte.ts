import type { Notification, NotificationKind } from '$lib/types/notification';
import { getContext, setContext } from 'svelte';

const NOTIFICATIONS_KEY = Symbol('notifications');

const DEFAULT_DURATION = 4500;
const MAX_VISIBLE = 4;

export class NotificationStore {
	items = $state<Notification[]>([]);

	private nextId = 1;

	notice(message: string, duration = DEFAULT_DURATION): number {
		return this.push('notice', message, duration);
	}

	confirm(message: string, duration = DEFAULT_DURATION): number {
		return this.push('confirm', message, duration);
	}

	fault(message: string, duration = DEFAULT_DURATION): number {
		return this.push('fault', message, duration);
	}

	push(kind: NotificationKind, message: string, duration = DEFAULT_DURATION): number {
		const id = this.nextId;
		this.nextId += 1;

		this.items.push({ id, kind, message });
		while (this.items.length > MAX_VISIBLE) {
			const oldest = this.items[0];
			this.dismiss(oldest.id);
		}

		// Timers are not tracked: one that fires after its notification is gone filters out nothing.
		if (duration > 0) {
			setTimeout(() => this.dismiss(id), duration);
		}
		return id;
	}

	dismiss(id: number): void {
		this.items = this.items.filter((item) => item.id !== id);
	}

	clear(): void {
		this.items = [];
	}
}

export function setNotifications(): NotificationStore {
	return setContext(NOTIFICATIONS_KEY, new NotificationStore());
}

export function getNotifications(): NotificationStore {
	return getContext<NotificationStore>(NOTIFICATIONS_KEY);
}
