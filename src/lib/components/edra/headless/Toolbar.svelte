<script lang="ts">
	import ImageIcon from '@lucide/svelte/icons/image';
	import Link2 from '@lucide/svelte/icons/link-2';
	import { m } from '$lib/paraglide/messages.js';
	import { getEditor, useEditorTransaction } from '../tiptap/index.ts';
	import { COMMAND_GROUPS, type EditorCommand } from './commands';
	import LinkForm from './LinkForm.svelte';

	interface Props {
		/** Opens the file picker; the owner of the editor uploads the file and inserts it. */
		onimage: () => void;
		isAllowedLink: (url: string) => boolean;
	}

	let { onimage, isAllowedLink }: Props = $props();

	const editor = getEditor();
	const transaction = useEditorTransaction(editor);

	let linkOpen = $state(false);

	function isActive(command: EditorCommand): boolean {
		void transaction.version;
		return command.isActive?.(editor) ?? false;
	}

	function canRun(command: EditorCommand): boolean {
		void transaction.version;
		return command.canRun?.(editor) ?? true;
	}

	function linkActive(): boolean {
		void transaction.version;
		return editor.isActive('link');
	}

	function titleOf(command: EditorCommand): string {
		if (command.shortcut === undefined) {
			return command.label();
		}
		return `${command.label()} (${command.shortcut})`;
	}

	/** Keeps the editor's selection when a toolbar button takes the pointer. */
	function keepSelection(event: MouseEvent): void {
		event.preventDefault();
	}
</script>

<div class="toolbar" role="toolbar" aria-label={m.editor_toolbar()}>
	{#each COMMAND_GROUPS as group, index (index)}
		<div class="group">
			{#each group as command (command.id)}
				{@const Icon = command.icon}
				<button
					type="button"
					class="tool"
					class:active={isActive(command)}
					aria-label={command.label()}
					title={titleOf(command)}
					disabled={!canRun(command)}
					onmousedown={keepSelection}
					onclick={() => command.run(editor)}
				>
					<Icon size={17} />
				</button>
			{/each}
		</div>
	{/each}
	<div class="group">
		<button
			type="button"
			class="tool"
			class:active={linkActive() || linkOpen}
			aria-label={m.editor_link()}
			aria-expanded={linkOpen}
			title={m.editor_link()}
			onmousedown={keepSelection}
			onclick={() => (linkOpen = !linkOpen)}
		>
			<Link2 size={17} />
		</button>
		<button
			type="button"
			class="tool"
			aria-label={m.editor_image()}
			title={m.editor_image()}
			onmousedown={keepSelection}
			onclick={onimage}
		>
			<ImageIcon size={17} />
		</button>
	</div>
</div>
{#if linkOpen}
	<LinkForm {isAllowedLink} onclose={() => (linkOpen = false)} />
{/if}

<style lang="scss">
	@use '../../../../styles/colors' as clr;
	@use '../../../../styles/forms' as forms;
	@use '../../../../styles/variables' as vars;

	// One scrolling row everywhere: wrapped rows push the text down, most of all in the map panel.
	.toolbar {
		display: flex;
		gap: 0.6rem;
		padding: 0.35rem;
		overflow-x: auto;
		scrollbar-width: none;
		background-color: clr.$surfaceColor;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radius;
	}

	.group {
		display: flex;
		gap: 0.15rem;

		&:not(:last-child) {
			padding-right: 0.6rem;
			border-right: 1px solid clr.$borderMutedColor;
		}
	}

	.tool {
		@include forms.toolButton;

		&.active {
			@include forms.toolButtonActive;
		}
	}

	// A mouse needs neither touch sized buttons nor a hidden scrollbar: smaller buttons fit
	// the note page in one row, and a thin scrollbar shows that narrower panels hold more.
	@media (pointer: fine) {
		.toolbar {
			scrollbar-width: thin;
		}

		.tool {
			width: 2rem;
			height: 2rem;
		}
	}
</style>
