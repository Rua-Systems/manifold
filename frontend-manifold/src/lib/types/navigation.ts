import type { Pathname } from '$app/types';
import type { Component } from 'svelte';

export interface NavigationLink {
	href: Pathname;
	label: () => string;
}

export interface AsideLink extends NavigationLink {
	icon: Component;
}
