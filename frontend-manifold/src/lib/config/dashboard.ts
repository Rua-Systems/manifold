import GridIcon from '$lib/components/icons/GridIcon.svelte';
import MapPinIcon from '$lib/components/icons/MapPinIcon.svelte';
import { m } from '$lib/paraglide/messages.js';
import type { AsideLink } from '$lib/types/navigation';

export const DASHBOARD_ASIDE_LINKS: AsideLink[] = [
	{ href: '/dashboard', label: m.dashboard_overview, icon: GridIcon },
	{ href: '/dashboard/map-notes', label: m.dashboard_map_notes, icon: MapPinIcon }
];
