import {
	serializeSidebarPreferences,
	SIDEBAR_COOKIE,
	SIDEBAR_COOKIE_MAX_AGE,
	type SidebarPreferences
} from '$lib/utils/sidebar-preferences';
import { getContext, setContext } from 'svelte';

const SIDEBAR_KEY = Symbol('sidebar');

export class SidebarState {
	/** Desktop: full width with labels, or collapsed to an icon rail. */
	expanded = $state(true);

	/** Mobile: the off-canvas drawer is showing. */
	drawerOpen = $state(false);

	closedGroups = $state<string[]>([]);

	constructor(preferences: SidebarPreferences) {
		this.expanded = !preferences.collapsed;
		this.closedGroups = [...preferences.closedGroups];
	}

	toggle(): void {
		this.expanded = !this.expanded;
		this.save();
	}

	expand(): void {
		if (!this.expanded) {
			this.expanded = true;
			this.save();
		}
	}

	isGroupOpen(id: string): boolean {
		return !this.closedGroups.includes(id);
	}

	openGroup(id: string): void {
		if (!this.isGroupOpen(id)) {
			this.closedGroups = this.closedGroups.filter((group) => group !== id);
			this.save();
		}
	}

	toggleGroup(id: string): void {
		if (this.isGroupOpen(id)) {
			this.closedGroups = [...this.closedGroups, id];
		} else {
			this.closedGroups = this.closedGroups.filter((group) => group !== id);
		}
		this.save();
	}

	openDrawer(): void {
		this.drawerOpen = true;
	}

	closeDrawer(): void {
		this.drawerOpen = false;
	}

	private save(): void {
		const value = serializeSidebarPreferences({
			collapsed: !this.expanded,
			closedGroups: this.closedGroups
		});
		// Secure wherever the page itself is, so the cookie never travels over plain http.
		const secure = location.protocol === 'https:' ? '; secure' : '';
		document.cookie = `${SIDEBAR_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; samesite=lax${secure}`;
	}
}

export function setSidebarState(preferences: SidebarPreferences): SidebarState {
	return setContext(SIDEBAR_KEY, new SidebarState(preferences));
}

export function getSidebarState(): SidebarState {
	return getContext<SidebarState>(SIDEBAR_KEY);
}
