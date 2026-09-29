<script lang="ts">
	import CodeBlock from '$lib/components/edra/headless/CodeBlock.svelte';
	import { ImageUpload } from '$lib/components/edra/headless/image-upload';
	import LinkMenu from '$lib/components/edra/headless/LinkMenu.svelte';
	import TableMenu from '$lib/components/edra/headless/TableMenu.svelte';
	import Toolbar from '$lib/components/edra/headless/Toolbar.svelte';
	import { SvelteNodeViewRenderer, Tiptap, useEditor } from '$lib/components/edra/tiptap';
	import { m } from '$lib/paraglide/messages.js';
	import { Node as TiptapNode, type AnyExtension } from '@tiptap/core';
	import { Placeholder } from '@tiptap/extensions';
	import { untrack } from 'svelte';
	import type { NoteContent } from '../content';
	import { isAllowedLink, noteExtensions } from '../extensions';

	interface Props {
		content: NoteContent;
		/** Accessible name of the editable area. */
		label: string;
		editable?: boolean;
		onchange?: (content: NoteContent) => void;
		onblur?: () => void;
		/** Stores an image and resolves to its address, or null when it was refused. */
		onupload?: (file: File) => Promise<string | null>;
	}

	let { content, label, editable = true, onchange, onblur, onupload }: Props = $props();

	const IMAGE_TYPES = 'image/png,image/jpeg,image/gif,image/webp';

	let fileInput: HTMLInputElement | undefined = $state();

	async function upload(file: File): Promise<string | null> {
		if (onupload === undefined) {
			return null;
		}
		return onupload(file);
	}

	/** Same schema as the server; only the code block gets Edra's view on top. */
	function withNodeViews(extension: AnyExtension): AnyExtension {
		if (extension instanceof TiptapNode && extension.name === 'codeBlock') {
			return extension.extend({ addNodeView: () => SvelteNodeViewRenderer(CodeBlock) });
		}
		return extension;
	}

	const editor = useEditor({
		extensions: [
			...noteExtensions().map(withNodeViews),
			Placeholder.configure({ placeholder: m.notes_placeholder() }),
			ImageUpload.configure({ upload })
		],
		content: untrack(() => content),
		editable: untrack(() => editable),
		editorProps: {
			attributes: () => ({ 'aria-label': label, 'aria-multiline': 'true', role: 'textbox' })
		},
		onUpdate: ({ editor: current }) => onchange?.(current.getJSON()),
		onBlur: () => onblur?.()
	});

	async function pickImage(): Promise<void> {
		const files = Array.from(fileInput?.files ?? []);
		if (fileInput !== undefined) {
			fileInput.value = '';
		}
		for (const file of files) {
			const src = await upload(file);
			if (src !== null) {
				editor?.chain().focus().setImage({ src }).run();
			}
		}
	}
</script>

<div class="editor" class:editable>
	{#if editor}
		<Tiptap {editor}>
			{#if editable}
				<div class="toolbar">
					<Toolbar onimage={() => fileInput?.click()} {isAllowedLink} />
				</div>
				<LinkMenu />
				<TableMenu />
			{/if}
			<Tiptap.Content class="note-content" />
		</Tiptap>
	{:else}
		<!-- The editor only exists in the browser; this keeps its space during server rendering. -->
		<div class="note-content"></div>
	{/if}
	{#if editable}
		<input
			bind:this={fileInput}
			type="file"
			accept={IMAGE_TYPES}
			class="visually-hidden"
			tabindex="-1"
			aria-hidden="true"
			onchange={pickImage}
		/>
	{/if}
</div>

<style lang="scss">
	@use '../../../../styles/colors' as clr;
	@use '../../../../styles/variables' as vars;

	.editor {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		min-width: 0;

		> .toolbar {
			position: sticky;
			top: 0;
			z-index: 10;
			padding-top: 0.4rem;
			background-color: clr.$backgroundColor;
		}

		// The rendered document belongs to TipTap, not to this component.
		:global(.note-content) {
			min-height: 16rem;
			min-width: 0;
		}

		:global(.tiptap) {
			min-height: 16rem;
			padding: 0.2rem 0 2rem;
			font-size: 0.95rem;
			line-height: 1.7;
			color: clr.$textPrimaryColor;
			overflow-wrap: anywhere;
			outline: none;

			> :global(* + *) {
				margin-top: 0.8rem;
			}

			:global(p) {
				margin: 0;
				color: inherit;
				line-height: inherit;
			}

			:global(h1),
			:global(h2),
			:global(h3) {
				margin: 1.6rem 0 0;
				line-height: 1.25;
			}

			:global(h1) {
				font-size: 1.6rem;
			}

			:global(h2) {
				font-size: 1.3rem;
			}

			:global(h3) {
				font-size: 1.1rem;
			}

			:global(a) {
				color: clr.$accentColor;
				text-underline-offset: 0.2em;
			}

			:global(code) {
				padding: 0.1rem 0.3rem;
				font-size: 0.88em;
				background-color: clr.$surfaceHoverColor;
				border-radius: vars.$radius;
			}

			:global(.code-block) {
				background-color: clr.$surfaceColor;
				border: 1px solid clr.$borderSubtleColor;
				border-radius: vars.$radius;

				:global(code) {
					padding: 0;
					background-color: transparent;
				}
			}

			:global(blockquote) {
				margin-inline: 0;
				padding-left: 1rem;
				color: clr.$textSecondaryColor;
				border-left: 2px solid clr.$accentMutedColor;
			}

			:global(hr) {
				margin-block: 1.4rem;
				border: 0;
				border-top: 1px solid clr.$borderSubtleColor;
			}

			:global(hr.ProseMirror-selectednode) {
				border-top-color: clr.$accentColor;
			}

			:global(ul),
			:global(ol) {
				padding-left: 1.5rem;
			}

			:global(ul[data-type='taskList']) {
				padding-left: 0.2rem;
				list-style: none;

				:global(li) {
					display: flex;
					align-items: flex-start;
					gap: 0.6rem;

					> :global(label) {
						flex: none;
						padding-top: 0.2rem;
					}

					> :global(div) {
						flex: 1;
						min-width: 0;
					}
				}

				:global(input[type='checkbox']) {
					width: 1rem;
					height: 1rem;
					accent-color: clr.$accentColor;
				}
			}

			:global(img) {
				display: block;
				max-width: 100%;
				height: auto;
				border-radius: vars.$radius;
			}

			:global(img.ProseMirror-selectednode) {
				outline: 2px solid clr.$accentColor;
			}

			:global(.tableWrapper) {
				overflow-x: auto;
			}

			:global(table) {
				width: 100%;
				border-collapse: collapse;
				table-layout: fixed;
			}

			:global(th),
			:global(td) {
				position: relative;
				min-width: 4rem;
				padding: 0.4rem 0.6rem;
				text-align: left;
				vertical-align: top;
				border: 1px solid clr.$borderSubtleColor;
			}

			:global(th) {
				font-weight: 700;
				background-color: clr.$surfaceColor;
			}

			:global(.selectedCell)::after {
				position: absolute;
				inset: 0;
				content: '';
				background-color: clr.$accentWashColor;
				pointer-events: none;
			}

			:global(p.is-editor-empty:first-child)::before {
				float: left;
				height: 0;
				content: attr(data-placeholder);
				color: clr.$textMutedColor;
				pointer-events: none;
			}
		}
	}
</style>
