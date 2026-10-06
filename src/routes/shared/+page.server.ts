import { loadSharedNote, sharedNoteActions } from '$lib/modules/notes/shared.page.server';
import type { Actions, PageServerLoad } from './$types';

// Outside the (app) group: a visitor with a note token sees one note without signing in.
export const load: PageServerLoad = (event) => loadSharedNote(event);

export const actions = sharedNoteActions satisfies Actions;
