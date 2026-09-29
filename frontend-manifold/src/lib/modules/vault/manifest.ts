import { m } from '$lib/paraglide/messages.js';
import type { ModuleManifest } from '../types';
import VaultIcon from './components/VaultIcon.svelte';

export const vaultManifest: ModuleManifest = {
	id: 'vault',
	label: m.vault_title,
	icon: VaultIcon,
	href: '/vault',
	position: 30,
	sidebar: 'link',
	// Metadata only: no key can ever read or write a value.
	scopes: [{ id: 'vault:read', access: 'read', label: m.scope_vault_read }]
};
