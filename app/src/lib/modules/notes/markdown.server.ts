import { MarkdownManager } from '@tiptap/markdown';
import type { NoteContent } from './content';
import { validateNoteContent } from './content.server';
import { noteExtensions } from './extensions';

// Built once and reused: each MarkdownManager registers its tokenizers on the shared marked
// instance, so creating one per call would stack them up.
let manager: MarkdownManager | undefined;

function markdownManager(): MarkdownManager {
	if (manager === undefined) {
		manager = new MarkdownManager({ extensions: noteExtensions() });
		// Without a DOM, @tiptap/markdown keeps raw HTML as literal text. Notes drop raw HTML
		// instead, and the method is private in the typings, so it is replaced on this instance.
		(manager as unknown as { parseHTMLToken: () => null }).parseHTMLToken = () => null;
	}
	return manager;
}

export function noteToMarkdown(content: NoteContent): string {
	return markdownManager().serialize(content);
}

/** Parses Markdown into note content and validates it like any other write. */
export function markdownToNote(markdown: string): NoteContent {
	return validateNoteContent(markdownManager().parse(markdown));
}
