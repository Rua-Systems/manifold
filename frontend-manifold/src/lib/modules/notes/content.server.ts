import { m } from '$lib/paraglide/messages.js';
import { ValidationError } from '$lib/server/errors';
import { generateText, getSchema } from '@tiptap/core';
import { Node, type Schema } from '@tiptap/pm/model';
import type { NoteContent } from './content';
import { fileIdFromSource, isAllowedLink, noteExtensions } from './extensions';

export const NOTE_CONTENT_MAX_BYTES = 2 * 1024 * 1024;

// Built once: the schema never changes while the process runs.
let schema: Schema | undefined;

function noteSchema(): Schema {
	if (schema === undefined) {
		schema = getSchema(noteExtensions());
	}
	return schema;
}

function invalid(): ValidationError {
	return new ValidationError({ content: m.notes_error_content() });
}

function isDocument(value: unknown): value is NoteContent {
	return typeof value === 'object' && value !== null && (value as NoteContent).type === 'doc';
}

/**
 * Checks incoming TipTap JSON against the shared extension list: unknown node or mark types, a
 * broken structure, links other than http, https or mailto, and images that are not uploaded
 * files are all rejected. Returns the content as ProseMirror normalises it (unknown attributes
 * dropped).
 */
export function validateNoteContent(input: unknown): NoteContent {
	let serialized: string;
	try {
		serialized = JSON.stringify(input);
	} catch {
		throw invalid();
	}
	if (Buffer.byteLength(serialized ?? '') > NOTE_CONTENT_MAX_BYTES) {
		throw new ValidationError({ content: m.notes_error_too_large() });
	}
	if (!isDocument(input)) {
		throw invalid();
	}

	let document: Node;
	try {
		document = Node.fromJSON(noteSchema(), input);
		document.check();
	} catch {
		throw invalid();
	}

	let problem: ValidationError | null = null;
	document.descendants((node) => {
		if (node.type.name === 'image' && fileIdFromSource(node.attrs.src) === null) {
			problem = new ValidationError({ content: m.notes_error_image() });
		}
		for (const mark of node.marks) {
			if (mark.type.name === 'link' && !isAllowedLink(String(mark.attrs.href ?? ''))) {
				problem = new ValidationError({ content: m.notes_error_link() });
			}
		}
		return problem === null;
	});
	if (problem !== null) {
		throw problem;
	}
	return document.toJSON() as NoteContent;
}

/** The plain text of a note, for excerpts and search. */
export function contentToText(content: NoteContent): string {
	return generateText(content, noteExtensions(), { blockSeparator: '\n' });
}
