import { postAction } from '$lib/utils/actions';
import { localizedHref } from '$lib/utils/navigation';
import {
	serializeSidebarPreferences,
	SIDEBAR_COOKIE,
	SIDEBAR_COOKIE_MAX_AGE,
	type SidebarPreferences
} from '$lib/utils/sidebar-preferences';
import { clampSidebarWidth } from '$lib/utils/sidebar-width';
import { getContext, setContext } from 'svelte';

const SIDEBAR_KEY = Symbol('sidebar');

export class SidebarState {
	/** Desktop: full width with labels, or collapsed to an icon rail. */
	expanded = $state(true);

	/** Mobile: the off-canvas drawer is showing. */
	drawerOpen = $state(false);

	closedGroups = $state<string[]>([]);

	/** Desktop: the width the edge was dragged to, in pixels, or null for the default width. */
	width = $state<number | null>(null);

	/** The edge is being dragged, so the width follows the pointer without its transition. */
	resizing = $state(false);

	constructor(preferences: SidebarPreferences, width: number | null) {
		this.expanded = !preferences.collapsed;
		this.closedGroups = [...preferences.closedGroups];
		this.width = width;
	}

	setWidth(width: number): void {
		this.width = clampSidebarWidth(width);
	}

	resetWidth(): void {
		this.width = null;
	}

	// Saves go out one after another, so the last width the owner chose is the one that stays.
	private saving: Promise<void> = Promise.resolve();

	/**
	 * Keeps the width in the owner's settings, so every browser opens the sidebar as wide. A failed
	 * save only costs the width on the next visit, so it is not reported.
	 */
	saveWidth(): Promise<void> {
		this.saving = this.saving.then(async () => {
			try {
				await postAction(`${localizedHref('/sidebar')}?/width`, {
					width: String(this.width ?? '')
				});
			} catch {
				// The page keeps the width it shows; the next drag saves it again.
			}
		});
		return this.saving;
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

export function setSidebarState(
	preferences: SidebarPreferences,
	width: number | null
): SidebarState {
	return setContext(SIDEBAR_KEY, new SidebarState(preferences, width));
}

export function getSidebarState(): SidebarState {
	return getContext<SidebarState>(SIDEBAR_KEY);
}
