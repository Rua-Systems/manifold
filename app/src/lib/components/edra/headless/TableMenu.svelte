<script lang="ts">
	import BetweenHorizontalEnd from '@lucide/svelte/icons/between-horizontal-end';
	import BetweenVerticalEnd from '@lucide/svelte/icons/between-vertical-end';
	import Columns3 from '@lucide/svelte/icons/columns-3';
	import Rows3 from '@lucide/svelte/icons/rows-3';
	import TableProperties from '@lucide/svelte/icons/table-properties';
	import X from '@lucide/svelte/icons/x';
	import { m } from '$lib/paraglide/messages.js';
	import type { Component } from 'svelte';
	import { BubbleMenu, getEditor, type Editor } from '../tiptap/index.ts';

	// In place of Edra's row and column grip menus: one bubble menu while the cursor is in a table.

	interface TableAction {
		id: string;
		label: () => string;
		icon: Component;
		run: (editor: Editor) => void;
	}

	const ACTIONS: TableAction[] = [
		{
			id: 'row-after',
			label: m.editor_table_add_row,
			icon: BetweenHorizontalEnd,
			run: (editor) => editor.chain().focus().addRowAfter().run()
		},
		{
			id: 'row-delete',
			label: m.editor_table_delete_row,
			icon: Rows3,
			run: (editor) => editor.chain().focus().deleteRow().run()
		},
		{
			id: 'column-after',
			label: m.editor_table_add_column,
			icon: BetweenVerticalEnd,
			run: (editor) => editor.chain().focus().addColumnAfter().run()
		},
		{
			id: 'column-delete',
			label: m.editor_table_delete_column,
			icon: Columns3,
			run: (editor) => editor.chain().focus().deleteColumn().run()
		},
		{
			id: 'header-row',
			label: m.editor_table_header_row,
			icon: TableProperties,
			run: (editor) => editor.chain().focus().toggleHeaderRow().run()
		},
		{
			id: 'delete',
			label: m.editor_table_delete,
			icon: X,
			run: (editor) => editor.chain().focus().deleteTable().run()
		}
	];

	const editor = getEditor();
</script>

<BubbleMenu
	{editor}
	pluginKey="tableMenu"
	shouldShow={({ editor: current }) =>
		current.isEditable && current.isActive('table') && !current.isActive('link')}
	options={{ placement: 'top', strategy: 'absolute' }}
	class="editor-bubble"
>
	{#each ACTIONS as action (action.id)}
		{@const Icon = action.icon}
		<button
			type="button"
			class="tool"
			aria-label={action.label()}
			title={action.label()}
			onclick={() => action.run(editor)}
		>
			<Icon size={16} />
		</button>
	{/each}
</BubbleMenu>

<style lang="scss">
	@use '../../../../styles/forms' as forms;

	.tool {
		@include forms.toolButton;
	}
</style>
