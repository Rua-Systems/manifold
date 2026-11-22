import { loadMemoriesList } from '#lib/modules/memory/page.server.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => loadMemoriesList(url);
