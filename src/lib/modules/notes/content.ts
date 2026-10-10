import type { JSONContent } from '@tiptap/core';
import { fileIdFromSource } from './extensions';

/** TipTap JSON, validated against `noteExtensions()` on every write. */
export type NoteContent = JSONContent;

export function emptyNoteContent(): NoteContent {
	return { type: 'doc', content: [{ type: 'paragraph' }] };
}

/** Whether the content holds nothing but empty paragraphs, as a note nobody has written in. */
export function isEmptyNoteContent(content: NoteContent): boolean {
	return (content.content ?? []).every(
		(node) => node.type === 'paragraph' && (node.content ?? []).length === 0
	);
}

/** Ids of the uploaded files the content shows, as images or as linked attachments, once each. */
export function fileIdsInContent(content: NoteContent): string[] {
	const ids = new Set<string>();
	const add = (source: unknown): void => {
		const id = fileIdFromSource(source);
		if (id !== null) {
			ids.add(id);
		}
	};
	const visit = (node: NoteContent): void => {
		if (node.type === 'image') {
			add(node.attrs?.src);
		}
		for (const mark of node.marks ?? []) {
			if (mark.type === 'link') {
				add(mark.attrs?.href);
			}
		}
		for (const child of node.content ?? []) {
			visit(child);
		}
	};
	visit(content);
	return [...ids];
}
