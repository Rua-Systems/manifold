<script lang="ts">
	import { goto } from '$app/navigation';
	import CodeBlock from '$lib/components/edra/headless/CodeBlock.svelte';
	import { FileUpload } from '$lib/components/edra/headless/image-upload';
	import LinkMenu from '$lib/components/edra/headless/LinkMenu.svelte';
	import TableMenu from '$lib/components/edra/headless/TableMenu.svelte';
	import Toolbar from '$lib/components/edra/headless/Toolbar.svelte';
	import { SvelteNodeViewRenderer, Tiptap, useEditor } from '$lib/components/edra/tiptap';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import { formatBytes } from '$lib/utils/format';
	import { localizedHref } from '$lib/utils/navigation';
	import { Node as TiptapNode, type AnyExtension, type JSONContent } from '@tiptap/core';
	import { Placeholder } from '@tiptap/extensions';
	import { untrack } from 'svelte';
	import type { NoteContent } from '../content';
	import { fileIdFromSource, isAllowedLink, noteExtensions } from '../extensions';
	import type { AttachedFile } from '../types';

	interface Props {
		content: NoteContent;
		/** Accessible name of the editable area. */
		label: string;
		editable?: boolean;
		onchange?: (content: NoteContent) => void;
		onblur?: () => void;
		/** Stores a file and resolves to what the note shows of it, or null when it was refused. */
		onupload?: (file: File) => Promise<AttachedFile | null>;
		/** Lets the owner choose a stored file, then hands it to `insert`. */
		onpickfile?: (insert: (file: AttachedFile) => void) => void;
		/** Links to files open the file's page in the app while reading; for the signed in owner. */
		previewFileLinks?: boolean;
	}

	let {
		content,
		label,
		editable = true,
		onchange,
		onblur,
		onupload,
		onpickfile,
		previewFileLinks = false
	}: Props = $props();

	const IMAGE_TYPES = 'image/png,image/jpeg,image/gif,image/webp';
	/** Images a note shows inline. SVG stays a link: notes never take it as an image. */
	const INLINE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

	let imageInput: HTMLInputElement | undefined = $state();
	let attachInput: HTMLInputElement | undefined = $state();

	/** Puts a stored file into the note: an image inline, anything else as a link with its size. */
	function place(file: AttachedFile, position: number | null): void {
		let inserted: JSONContent | JSONContent[] = { type: 'image', attrs: { src: file.src } };
		if (!INLINE_TYPES.has(file.mimeType)) {
			inserted = [
				{
					type: 'text',
					text: `${file.name} (${formatBytes(file.sizeBytes, getLocale())})`,
					marks: [{ type: 'link', attrs: { href: file.src } }]
				},
				{ type: 'text', text: ' ' }
			];
		}
		const chain = editor?.chain().focus();
		if (position === null) {
			chain?.insertContent(inserted).run();
		} else {
			chain?.insertContentAt(position, inserted).run();
		}
	}

	async function upload(file: File, position: number | null): Promise<void> {
		if (onupload === undefined) {
			return;
		}
		const attached = await onupload(file);
		if (attached !== null) {
			place(attached, position);
		}
	}

	/** Reading, a link to a stored file opens its page, unless the reader asks for a new tab. */
	function openFileLink(event: MouseEvent): boolean {
		if (!previewFileLinks || editor?.isEditable !== false) {
			return false;
		}
		if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) {
			return false;
		}
		const anchor = (event.target as Element | null)?.closest('a');
		const id = fileIdFromSource(anchor?.getAttribute('href'));
		if (id === null) {
			return false;
		}
		event.preventDefault();
		void goto(localizedHref(`/files/view/${id}`));
		return true;
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
			FileUpload.configure({ upload })
		],
		content: untrack(() => content),
		editable: untrack(() => editable),
		editorProps: {
			attributes: () => ({
				'aria-label': label,
				'aria-multiline': 'true',
				'aria-readonly': String(!editable),
				role: 'textbox'
			}),
			handleDOMEvents: {
				click: (_view, event) => openFileLink(event)
			}
		},
		onUpdate: ({ editor: current }) => onchange?.(current.getJSON()),
		onBlur: () => onblur?.()
	});

	// Reading and writing share one editor, so switching keeps the undo history. Without the
	// second argument the switch would count as a change and save the note.
	$effect(() => {
		editor?.setEditable(editable, false);
	});

	async function uploadPicked(input: HTMLInputElement | undefined): Promise<void> {
		const files = Array.from(input?.files ?? []);
		if (input !== undefined) {
			input.value = '';
		}
		for (const file of files) {
			await upload(file, null);
		}
	}
</script>

<div class="editor" class:editable>
	{#if editor}
		<Tiptap {editor}>
			{#if editable}
				<div class="toolbar">
					<Toolbar
						onimage={onupload === undefined ? undefined : () => imageInput?.click()}
						onattach={onupload === undefined ? undefined : () => attachInput?.click()}
						onpickfile={onpickfile === undefined
							? undefined
							: () => onpickfile((file) => place(file, null))}
						{isAllowedLink}
					/>
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
	{#if editable && onupload !== undefined}
		<input
			bind:this={imageInput}
			type="file"
			accept={IMAGE_TYPES}
			class="visually-hidden"
			tabindex="-1"
			aria-hidden="true"
			onchange={() => uploadPicked(imageInput)}
		/>
		<input
			bind:this={attachInput}
			type="file"
			multiple
			class="visually-hidden"
			tabindex="-1"
			aria-hidden="true"
			onchange={() => uploadPicked(attachInput)}
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

			// A link to a stored file reads as an attachment, with a paperclip in the text colour.
			:global(a[href^='/files/']) {
				padding: 0.05rem 0.4rem 0.05rem 0.3rem;
				text-decoration: none;
				background-color: clr.$accentWashColor;
				border: 1px solid clr.$borderSubtleColor;
				border-radius: vars.$radius;

				&::before {
					content: '';
					display: inline-block;
					width: 0.85em;
					height: 0.85em;
					margin-right: 0.3em;
					vertical-align: -0.1em;
					background-color: currentColor;
					mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551'/%3E%3C/svg%3E")
						center / contain no-repeat;
				}
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
