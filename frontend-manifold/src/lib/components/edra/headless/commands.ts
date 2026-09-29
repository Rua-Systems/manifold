import Bold from '@lucide/svelte/icons/bold';
import Code from '@lucide/svelte/icons/code';
import Heading1 from '@lucide/svelte/icons/heading-1';
import Heading2 from '@lucide/svelte/icons/heading-2';
import Heading3 from '@lucide/svelte/icons/heading-3';
import Italic from '@lucide/svelte/icons/italic';
import List from '@lucide/svelte/icons/list';
import ListChecks from '@lucide/svelte/icons/list-checks';
import ListOrdered from '@lucide/svelte/icons/list-ordered';
import Minus from '@lucide/svelte/icons/minus';
import Pilcrow from '@lucide/svelte/icons/pilcrow';
import Quote from '@lucide/svelte/icons/quote';
import Redo from '@lucide/svelte/icons/redo-2';
import SquareCode from '@lucide/svelte/icons/square-code';
import Strikethrough from '@lucide/svelte/icons/strikethrough';
import Table from '@lucide/svelte/icons/table';
import Undo from '@lucide/svelte/icons/undo-2';
import { m } from '$lib/paraglide/messages.js';
import type { Component } from 'svelte';
import type { Editor } from '../tiptap/index.ts';

// Edra's command structure, reduced to the content notes allow and labelled from the messages.

export interface EditorCommand {
	id: string;
	label: () => string;
	icon: Component;
	shortcut?: string;
	run: (editor: Editor) => void;
	isActive?: (editor: Editor) => boolean;
	canRun?: (editor: Editor) => boolean;
}

function heading(level: 1 | 2 | 3, icon: Component, label: () => string): EditorCommand {
	return {
		id: `heading-${level}`,
		label,
		icon,
		shortcut: `Ctrl+Alt+${level}`,
		run: (editor) => editor.chain().focus().toggleHeading({ level }).run(),
		isActive: (editor) => editor.isActive('heading', { level })
	};
}

export const COMMAND_GROUPS: EditorCommand[][] = [
	[
		{
			id: 'undo',
			label: m.editor_undo,
			icon: Undo,
			shortcut: 'Ctrl+Z',
			run: (editor) => editor.chain().focus().undo().run(),
			canRun: (editor) => editor.can().undo()
		},
		{
			id: 'redo',
			label: m.editor_redo,
			icon: Redo,
			shortcut: 'Ctrl+Y',
			run: (editor) => editor.chain().focus().redo().run(),
			canRun: (editor) => editor.can().redo()
		}
	],
	[
		{
			id: 'paragraph',
			label: m.editor_paragraph,
			icon: Pilcrow,
			run: (editor) => editor.chain().focus().setParagraph().run(),
			isActive: (editor) => editor.isActive('paragraph')
		},
		heading(1, Heading1, m.editor_heading_1),
		heading(2, Heading2, m.editor_heading_2),
		heading(3, Heading3, m.editor_heading_3)
	],
	[
		{
			id: 'bold',
			label: m.editor_bold,
			icon: Bold,
			shortcut: 'Ctrl+B',
			run: (editor) => editor.chain().focus().toggleBold().run(),
			isActive: (editor) => editor.isActive('bold')
		},
		{
			id: 'italic',
			label: m.editor_italic,
			icon: Italic,
			shortcut: 'Ctrl+I',
			run: (editor) => editor.chain().focus().toggleItalic().run(),
			isActive: (editor) => editor.isActive('italic')
		},
		{
			id: 'strike',
			label: m.editor_strike,
			icon: Strikethrough,
			shortcut: 'Ctrl+Shift+S',
			run: (editor) => editor.chain().focus().toggleStrike().run(),
			isActive: (editor) => editor.isActive('strike')
		},
		{
			id: 'code',
			label: m.editor_code,
			icon: Code,
			shortcut: 'Ctrl+E',
			run: (editor) => editor.chain().focus().toggleCode().run(),
			isActive: (editor) => editor.isActive('code')
		}
	],
	[
		{
			id: 'bullet-list',
			label: m.editor_bullet_list,
			icon: List,
			run: (editor) => editor.chain().focus().toggleBulletList().run(),
			isActive: (editor) => editor.isActive('bulletList')
		},
		{
			id: 'ordered-list',
			label: m.editor_ordered_list,
			icon: ListOrdered,
			run: (editor) => editor.chain().focus().toggleOrderedList().run(),
			isActive: (editor) => editor.isActive('orderedList')
		},
		{
			id: 'task-list',
			label: m.editor_task_list,
			icon: ListChecks,
			run: (editor) => editor.chain().focus().toggleTaskList().run(),
			isActive: (editor) => editor.isActive('taskList')
		}
	],
	[
		{
			id: 'blockquote',
			label: m.editor_blockquote,
			icon: Quote,
			run: (editor) => editor.chain().focus().toggleBlockquote().run(),
			isActive: (editor) => editor.isActive('blockquote')
		},
		{
			id: 'code-block',
			label: m.editor_code_block,
			icon: SquareCode,
			run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
			isActive: (editor) => editor.isActive('codeBlock')
		},
		{
			id: 'horizontal-rule',
			label: m.editor_horizontal_rule,
			icon: Minus,
			run: (editor) => editor.chain().focus().setHorizontalRule().run()
		},
		{
			id: 'table',
			label: m.editor_table,
			icon: Table,
			run: (editor) =>
				editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
			canRun: (editor) => !editor.isActive('table')
		}
	]
];
