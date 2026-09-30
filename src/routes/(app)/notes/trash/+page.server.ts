import { loadTrash, trashActions } from '$lib/modules/notes/page.server';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => loadTrash();

export const actions = trashActions satisfies Actions;
