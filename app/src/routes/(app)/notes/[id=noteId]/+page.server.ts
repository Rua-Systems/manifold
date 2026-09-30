import { loadNotePage, noteActions } from '$lib/modules/notes/page.server';
import { NOTE_DEPENDENCY } from '$lib/modules/notes/paths';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, url, depends }) => {
	depends(NOTE_DEPENDENCY);
	return loadNotePage(params.id, url);
};

export const actions = noteActions satisfies Actions;
