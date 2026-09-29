import SettingsIcon from '$lib/components/icons/SettingsIcon.svelte';
import { m } from '$lib/paraglide/messages.js';
import type { AsideLink, NavigationLink } from '$lib/types/navigation';

/** Account menu for visitors who are not signed in. */
export const GUEST_LINKS: NavigationLink[] = [{ href: '/login', label: m.nav_login }];

/** Account menu for the signed in owner. */
export const ACCOUNT_LINKS: NavigationLink[] = [{ href: '/settings', label: m.nav_settings }];

/** Core sidebar entries that belong to no module; they follow the module sections. */
export const CORE_SIDEBAR_LINKS: AsideLink[] = [
	{ href: '/settings', label: m.nav_settings, icon: SettingsIcon }
];
