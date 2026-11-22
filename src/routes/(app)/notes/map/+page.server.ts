import { loadMapPage, mapActions } from '#lib/modules/notes/map/page.server.ts';
import { MAP_DEPENDENCY } from '#lib/modules/notes/paths.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url, depends }) => {
	depends(MAP_DEPENDENCY);
	return loadMapPage(url);
};

export const actions = mapActions satisfies Actions;
