import type { Pathname } from '$app/types';
import type { Component } from 'svelte';

// Client safe half of a module manifest. The server half (sidebar data, API handlers, MCP tools,
// search, file references) lives in each module's manifest.server.ts.

export type ScopeAccess = 'read' | 'write';

export interface ApiScope {
	id: string;
	access: ScopeAccess;
	label: () => string;
}

export interface ModuleManifest {
	id: string;
	label: () => string;
	icon: Component;
	/** The module page: the target of a link entry, or of a group's label. */
	href: Pathname;
	/** Sidebar order, lowest first. */
	position: number;
	sidebar: 'link' | 'group';
	scopes: ApiScope[];
}

export type SidebarLink = { kind: 'internal'; path: Pathname } | { kind: 'external'; url: string };

export type SidebarIcon = { kind: 'image'; src: string } | { kind: 'letter'; letter: string };

export interface SidebarItem {
	id: string;
	label: string;
	link: SidebarLink;
	icon?: SidebarIcon;
	/** Hidden by the group's filter field when its label does not match. */
	filterable?: boolean;
}

export interface SidebarGroup {
	items: SidebarItem[];
	/** Shows a filter field above the first filterable item, with this accessible label. */
	filterLabel?: string;
}

/** Sidebar group contents by module id, loaded on the server for every protected page. */
export type SidebarData = Record<string, SidebarGroup>;
