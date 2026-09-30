import type { Extensions } from '@tiptap/core';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Image from '@tiptap/extension-image';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import StarterKit from '@tiptap/starter-kit';
import { common, createLowlight } from 'lowlight';

// The one list of what a note may contain. The editor, the server's validation, plain text and
// Markdown conversion all build from it, so they can never disagree about the schema. The editor
// adds only behaviour on top (node views, placeholder, menus), never new node types or attributes.

const LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

const FILE_SOURCE = /^\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export const lowlight = createLowlight(common);

export function isAllowedLink(url: string): boolean {
	try {
		return LINK_PROTOCOLS.has(new URL(url).protocol);
	} catch {
		return false;
	}
}

/** The file id of an image source this app serves, or null for anything else. */
export function fileIdFromSource(source: unknown): string | null {
	if (typeof source !== 'string') {
		return null;
	}
	return FILE_SOURCE.exec(source)?.[1]?.toLowerCase() ?? null;
}

export function noteExtensions(): Extensions {
	return [
		StarterKit.configure({
			heading: { levels: [1, 2, 3] },
			underline: false,
			codeBlock: false,
			link: {
				openOnClick: false,
				autolink: true,
				linkOnPaste: true,
				isAllowedUri: (url) => isAllowedLink(url),
				HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' }
			}
		}),
		CodeBlockLowlight.configure({ lowlight, defaultLanguage: null }),
		TaskList,
		TaskItem.configure({ nested: true }),
		TableKit.configure({ table: { resizable: false } }),
		Image.configure({ allowBase64: false, inline: false })
	];
}
