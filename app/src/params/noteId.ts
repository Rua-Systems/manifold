import { NEW_NOTE_ID } from '$lib/modules/notes/paths';
import { isUuid } from '$lib/utils/uuid';
import type { ParamMatcher } from '@sveltejs/kit';

/** A note id, or `new` for a note whose first save creates it. */
export const match: ParamMatcher = (param) => param === NEW_NOTE_ID || isUuid(param);
