import { dataSourceActions, loadDataSource } from '$lib/modules/datasources/page.server';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => loadDataSource(params.id);

export const actions = dataSourceActions satisfies Actions;
