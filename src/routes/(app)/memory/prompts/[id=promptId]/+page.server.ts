import { loadPromptPage, promptActions } from '$lib/modules/memory/prompts/page.server';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => loadPromptPage(params.id);

export const actions = promptActions satisfies Actions;
