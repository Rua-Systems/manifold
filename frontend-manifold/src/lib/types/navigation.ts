import type { Component } from 'svelte';

export interface NavigationLink {
	href: string;
	label: string;
}

export interface AsideLink extends NavigationLink {
	icon: Component;
}
