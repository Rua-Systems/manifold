import { loadServicesPage, servicesActions } from '#lib/modules/services/page.server.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => loadServicesPage();

export const actions = servicesActions satisfies Actions;
