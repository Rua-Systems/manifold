import { loadNotesList } from '$lib/modules/notes/page.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => loadNotesList(url);
