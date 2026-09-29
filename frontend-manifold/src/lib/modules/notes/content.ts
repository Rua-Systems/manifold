import type { JSONContent } from '@tiptap/core';
import { fileIdFromSource } from './extensions';

/** TipTap JSON, validated against `noteExtensions()` on every write. */
export type NoteContent = JSONContent;

export function emptyNoteContent(): NoteContent {
	return { type: 'doc', content: [{ type: 'paragraph' }] };
}

/** Ids of the uploaded files the content shows as images, without duplicates. */
export function fileIdsInContent(content: NoteContent): string[] {
	const ids = new Set<string>();
	const visit = (node: NoteContent): void => {
		if (node.type === 'image') {
			const id = fileIdFromSource(node.attrs?.src);
			if (id !== null) {
				ids.add(id);
			}
		}
		for (const child of node.content ?? []) {
			visit(child);
		}
	};
	visit(content);
	return [...ids];
}
