<script lang="ts">
	import type { Editor } from '../Editor.ts';
	import { setEditor } from './editorContext.js';
	import { type Snippet, untrack } from 'svelte';

	let { editor, children }: { editor: Editor | undefined; children?: Snippet } = $props();

	// The context holds the editor the component was created with; a new editor needs a new root.
	const initialEditor = untrack(() => editor);
	if (initialEditor) {
		setEditor(initialEditor);
	}
</script>

{#if editor && children}
	{@render children()}
{/if}
