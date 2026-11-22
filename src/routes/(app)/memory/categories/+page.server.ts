import { loadCategoriesPage, memoryCategoryActions } from '#lib/modules/memory/page.server.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => loadCategoriesPage();

export const actions = memoryCategoryActions satisfies Actions;
