import type { SidebarIcon } from '$lib/modules/types';

// The dashboard is built from cards that modules and the core return as data, so the page draws
// every card the same way and a new module only adds a `dashboard` hook.

/** A number on a card; bytes are shown as a size. */
export interface DashboardStat {
	id: string;
	label: string;
	value: number;
	unit: 'count' | 'bytes';
}

/** One day of a daily series, `YYYY-MM-DD` in UTC. */
export interface DashboardDay {
	day: string;
	value: number;
}

export interface DashboardLink {
	id: string;
	label: string;
	href: string;
	external: boolean;
	icon?: SidebarIcon;
	/** Shown as how long ago, such as when a note last changed. */
	time?: Date;
	/** A short code beside the label, such as the action of an audit event. */
	code?: string;
}

export type DashboardBlock =
	| { kind: 'stats'; stats: DashboardStat[] }
	| { kind: 'days'; id: string; title: string; days: DashboardDay[] }
	| { kind: 'links'; id: string; title: string; links: DashboardLink[]; empty: string };

export interface DashboardCard {
	id: string;
	title: string;
	/** The page the card sums up, opened from its heading. */
	href: string;
	blocks: DashboardBlock[];
}

export interface Dashboard {
	generatedAt: Date;
	cards: DashboardCard[];
}
