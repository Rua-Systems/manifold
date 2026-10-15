import { loadMemoryPage, memoryActions } from '$lib/modules/memory/page.server';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, url }) => loadMemoryPage(params.id, url);

export const actions = memoryActions satisfies Actions;
