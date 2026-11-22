import { loadTagsPage, tagsActions } from '#lib/server/tags/page.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => loadTagsPage();

export const actions = tagsActions satisfies Actions;
