import { basemapsActions, loadBasemapsPage } from '#lib/modules/notes/map/basemaps.page.server.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => loadBasemapsPage();

export const actions = basemapsActions satisfies Actions;
