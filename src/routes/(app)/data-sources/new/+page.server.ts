import { loadNewDataSource, newDataSourceActions } from '$lib/modules/datasources/page.server';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => loadNewDataSource(url);

export const actions = newDataSourceActions satisfies Actions;
