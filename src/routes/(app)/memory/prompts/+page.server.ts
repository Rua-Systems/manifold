import { loadPromptsList } from '$lib/modules/memory/prompts/page.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => loadPromptsList(url);
