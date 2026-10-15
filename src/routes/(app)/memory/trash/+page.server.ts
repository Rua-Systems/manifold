import { loadMemoryTrash, memoryTrashActions } from '$lib/modules/memory/page.server';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => loadMemoryTrash();

export const actions = memoryTrashActions satisfies Actions;
