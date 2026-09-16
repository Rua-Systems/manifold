import type { NavigationLink } from '$lib/types/navigation';

export const PUBLIC_LINKS: NavigationLink[] = [
	{ href: '/', label: 'Home' },
	{ href: '/about', label: 'About' }
];

export const GUEST_LINKS: NavigationLink[] = [{ href: '/login', label: 'Login' }];

export const ACCOUNT_LINKS: NavigationLink[] = [
	{ href: '/profile', label: 'Profile' },
	{ href: '/dashboard', label: 'Dashboard' },
	{ href: '/settings', label: 'Settings' }
];

export const DASHBOARD_LINKS: NavigationLink[] = [
	{ href: '/dashboard', label: 'Overview' },
	{ href: '/dashboard/map-notes', label: 'Map Notes' }
];
