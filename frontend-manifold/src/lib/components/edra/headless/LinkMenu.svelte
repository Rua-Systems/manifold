<script lang="ts">
	import Copy from '@lucide/svelte/icons/copy';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import Unlink from '@lucide/svelte/icons/unlink';
	import { m } from '$lib/paraglide/messages.js';
	import { BubbleMenu, getEditor, useEditorState } from '../tiptap/index.ts';

	// Edra's link bubble menu: shown while the cursor is inside a link.

	const editor = getEditor();

	const linkState = useEditorState({
		editor,
		selector: ({ editor: current }) => ({
			href: String(current.getAttributes('link').href ?? '')
		})
	});
</script>

<BubbleMenu
	{editor}
	pluginKey="linkMenu"
	shouldShow={({ editor: current }) => current.isEditable && current.isActive('link')}
	options={{ placement: 'bottom', strategy: 'absolute' }}
	class="editor-bubble"
>
	<a
		class="tool"
		href={$linkState.href}
		target="_blank"
		rel="external noopener noreferrer"
		aria-label={m.editor_link_open()}
		title={m.editor_link_open()}
	>
		<ExternalLink size={16} />
	</a>
	<button
		type="button"
		class="tool"
		aria-label={m.editor_link_copy()}
		title={m.editor_link_copy()}
		onclick={() => navigator.clipboard.writeText($linkState.href)}
	>
		<Copy size={16} />
	</button>
	<button
		type="button"
		class="tool"
		aria-label={m.editor_link_remove()}
		title={m.editor_link_remove()}
		onclick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}
	>
		<Unlink size={16} />
	</button>
</BubbleMenu>

<style lang="scss">
	@use '../../../../styles/forms' as forms;

	.tool {
		@include forms.toolButton;
	}
</style>
