import { loadTrash, trashActions } from '#lib/modules/notes/page.server.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => loadTrash();

export const actions = trashActions satisfies Actions;
