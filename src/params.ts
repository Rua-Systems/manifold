import { defineParams } from '@sveltejs/kit/params';
import { NEW_MEMORY_ID } from '#lib/modules/memory/paths.ts';
import { isUuid } from '#lib/utils/uuid.ts';
import { NEW_NOTE_ID } from '#lib/modules/notes/paths.ts';
import { NEW_PROMPT_ID } from '#lib/modules/memory/prompts/paths.ts';

/** A memory id, or `new` for a memory whose first save creates it. */
const matchMemoryId = (param: string) => param === NEW_MEMORY_ID || isUuid(param);

/** A note id, or `new` for a note whose first save creates it. */
const matchNoteId = (param: string) => param === NEW_NOTE_ID || isUuid(param);

/** A prompt id, or `new` for a prompt whose first save creates it. */
const matchPromptId = (param: string) => param === NEW_PROMPT_ID || isUuid(param);

export const params = defineParams({
	memoryId: (param) => (matchMemoryId(param) ? param : undefined),
	noteId: (param) => (matchNoteId(param) ? param : undefined),
	promptId: (param) => (matchPromptId(param) ? param : undefined)
});
