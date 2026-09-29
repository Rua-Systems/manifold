import { getContext, setContext } from 'svelte';

const SIDEBAR_KEY = Symbol('sidebar');

export class SidebarState {
	/** Desktop: full width with labels, or collapsed to an icon rail. */
	expanded = $state(true);

	/** Mobile: the off-canvas drawer is showing. */
	drawerOpen = $state(false);

	toggle(): void {
		this.expanded = !this.expanded;
	}

	collapse(): void {
		this.expanded = false;
	}

	openDrawer(): void {
		this.drawerOpen = true;
	}

	closeDrawer(): void {
		this.drawerOpen = false;
	}
}

export function setSidebarState(): SidebarState {
	return setContext(SIDEBAR_KEY, new SidebarState());
}

export function getSidebarState(): SidebarState {
	return getContext<SidebarState>(SIDEBAR_KEY);
}
