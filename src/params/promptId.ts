import { NEW_PROMPT_ID } from '$lib/modules/memory/prompts/paths';
import { isUuid } from '$lib/utils/uuid';
import type { ParamMatcher } from '@sveltejs/kit';

/** A prompt id, or `new` for a prompt whose first save creates it. */
export const match: ParamMatcher = (param) => param === NEW_PROMPT_ID || isUuid(param);
