import type { Notification, NotificationKind } from '$lib/types/notification';
import { getContext, setContext } from 'svelte';

const NOTIFICATIONS_KEY = Symbol('notifications');

const DEFAULT_DURATION = 4500;
const MAX_VISIBLE = 4;

export class NotificationStore {
	items = $state<Notification[]>([]);

	private nextId = 1;
	private timers = new Map<number, ReturnType<typeof setTimeout>>();

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

		if (duration > 0) {
			this.timers.set(
				id,
				setTimeout(() => this.dismiss(id), duration)
			);
		}
		return id;
	}

	dismiss(id: number): void {
		const timer = this.timers.get(id);
		if (timer !== undefined) {
			clearTimeout(timer);
			this.timers.delete(id);
		}
		this.items = this.items.filter((item) => item.id !== id);
	}

	clear(): void {
		for (const timer of this.timers.values()) {
			clearTimeout(timer);
		}
		this.timers.clear();
		this.items = [];
	}
}

export function setNotifications(): NotificationStore {
	return setContext(NOTIFICATIONS_KEY, new NotificationStore());
}

export function getNotifications(): NotificationStore {
	return getContext<NotificationStore>(NOTIFICATIONS_KEY);
}
