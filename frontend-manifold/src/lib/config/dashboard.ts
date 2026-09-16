import GridIcon from '$lib/components/icons/GridIcon.svelte';
import MapPinIcon from '$lib/components/icons/MapPinIcon.svelte';
import type { AsideLink } from '$lib/types/navigation';

export const DASHBOARD_ASIDE_LINKS: AsideLink[] = [
	{ href: '/dashboard', label: 'Overview', icon: GridIcon },
	{ href: '/dashboard/map-notes', label: 'Map Notes', icon: MapPinIcon }
];
