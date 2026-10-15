import { m } from '$lib/paraglide/messages.js';
import { ValidationError } from '$lib/server/errors';
import type { NoteContent } from '../notes/content';
import { validateNoteContent } from '../notes/content.server';
import { markdownToNote } from '../notes/markdown.server';

// Memories are written in the note editor and its Markdown, with one difference: they hold text
// only. An image would tie a memory to a stored file that nothing keeps alive for it, and agents
// read memories as text anyway.

function hasImage(node: NoteContent): boolean {
	if (node.type === 'image') {
		return true;
	}
	return (node.content ?? []).some(hasImage);
}

function withoutImages(content: NoteContent): NoteContent {
	if (hasImage(content)) {
		throw new ValidationError({ content: m.memory_error_image() });
	}
	return content;
}

/** Checks TipTap JSON like a note's, and refuses images. */
export function validateMemoryContent(input: unknown): NoteContent {
	return withoutImages(validateNoteContent(input));
}

/** Parses Markdown like a note's, and refuses images. */
export function markdownToMemory(markdown: string): NoteContent {
	return withoutImages(markdownToNote(markdown));
}
