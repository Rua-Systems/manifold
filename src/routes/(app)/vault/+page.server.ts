import { loadVault, vaultActions } from '#lib/modules/vault/page.server.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => loadVault();

export const actions = vaultActions satisfies Actions;
