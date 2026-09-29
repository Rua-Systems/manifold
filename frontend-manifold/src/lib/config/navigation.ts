import { m } from '$lib/paraglide/messages.js';
import type { NavigationLink } from '$lib/types/navigation';

export const PUBLIC_LINKS: NavigationLink[] = [
	{ href: '/', label: m.nav_home },
	{ href: '/about', label: m.nav_about }
];

export const GUEST_LINKS: NavigationLink[] = [{ href: '/login', label: m.nav_login }];

export const ACCOUNT_LINKS: NavigationLink[] = [
	{ href: '/profile', label: m.nav_profile },
	{ href: '/dashboard', label: m.nav_dashboard },
	{ href: '/settings', label: m.nav_settings }
];
