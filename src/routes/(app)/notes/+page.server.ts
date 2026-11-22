import { noteFolderActions } from '#lib/modules/notes/folders.page.server.ts';
import { loadNotesList } from '#lib/modules/notes/page.server.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => loadNotesList(url);

export const actions = noteFolderActions satisfies Actions;
