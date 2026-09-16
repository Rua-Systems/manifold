import { getContext, setContext } from 'svelte';

const SIDEBAR_KEY = Symbol('sidebar');

export class SidebarState {
	expanded = $state(false);

	toggle(): void {
		this.expanded = !this.expanded;
	}

	collapse(): void {
		this.expanded = false;
	}
}

export function setSidebarState(): SidebarState {
	return setContext(SIDEBAR_KEY, new SidebarState());
}

export function getSidebarState(): SidebarState {
	return getContext<SidebarState>(SIDEBAR_KEY);
}
