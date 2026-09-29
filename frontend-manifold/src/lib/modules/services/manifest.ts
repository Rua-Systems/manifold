import { m } from '$lib/paraglide/messages.js';
import type { ModuleManifest } from '../types';
import ServicesIcon from './components/ServicesIcon.svelte';

export const servicesManifest: ModuleManifest = {
	id: 'services',
	label: m.services_title,
	icon: ServicesIcon,
	href: '/services',
	position: 10,
	sidebar: 'group',
	scopes: [
		{ id: 'services:read', access: 'read', label: m.scope_services_read },
		{ id: 'services:write', access: 'write', label: m.scope_services_write }
	]
};
