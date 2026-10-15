import { NEW_MEMORY_ID } from '$lib/modules/memory/paths';
import { isUuid } from '$lib/utils/uuid';
import type { ParamMatcher } from '@sveltejs/kit';

/** A memory id, or `new` for a memory whose first save creates it. */
export const match: ParamMatcher = (param) => param === NEW_MEMORY_ID || isUuid(param);
