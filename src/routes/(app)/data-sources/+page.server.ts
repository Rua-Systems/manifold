import {
	dataSourceListActions,
	loadDataSourcesPage
} from '#lib/modules/datasources/page.server.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => loadDataSourcesPage(url);

export const actions = dataSourceListActions satisfies Actions;
