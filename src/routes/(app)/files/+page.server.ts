import { filesActions, loadFilesPage } from '$lib/modules/files/page.server';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => loadFilesPage(url);

export const actions = filesActions satisfies Actions;
