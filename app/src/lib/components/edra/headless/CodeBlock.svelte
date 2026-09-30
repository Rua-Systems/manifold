<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import Copy from '@lucide/svelte/icons/copy';
	import { m } from '$lib/paraglide/messages.js';
	import type { NodeViewProps } from '@tiptap/core';
	import { NodeViewContent, NodeViewWrapper } from '../tiptap/index.ts';

	// Edra's code block view: a language picker and a copy button above the highlighted code.

	const { editor, node, updateAttributes, extension }: NodeViewProps = $props();

	const PLAIN = 'plaintext';

	let copied = $state(false);
	let pre: HTMLPreElement | undefined = $state();

	const languages: string[] = $derived(extension.options.lowlight.listLanguages().sort());
	const language: string = $derived(node.attrs.language ?? PLAIN);

	function changeLanguage(event: Event): void {
		const value = (event.currentTarget as HTMLSelectElement).value;
		if (value === PLAIN) {
			updateAttributes({ language: null });
			return;
		}
		updateAttributes({ language: value });
	}

	async function copy(): Promise<void> {
		if (pre === undefined) {
			return;
		}
		await navigator.clipboard.writeText(pre.innerText);
		copied = true;
		setTimeout(() => (copied = false), 1200);
	}
</script>

<NodeViewWrapper class="code-block">
	<div class="code-block-actions" contenteditable="false">
		<select
			aria-label={m.editor_code_language()}
			disabled={!editor.isEditable}
			value={language}
			onchange={changeLanguage}
		>
			<option value={PLAIN}>{m.editor_code_plain()}</option>
			{#each languages as name (name)}
				<option value={name}>{name}</option>
			{/each}
		</select>
		<button
			type="button"
			aria-label={m.editor_code_copy()}
			title={m.editor_code_copy()}
			onclick={copy}
		>
			{#if copied}
				<Check size={15} />
			{:else}
				<Copy size={15} />
			{/if}
		</button>
	</div>
	<pre bind:this={pre} spellcheck="false"><NodeViewContent
			as="code"
			class="language-{language}"
		/></pre>
</NodeViewWrapper>

<style lang="scss">
	@use '../../../../styles/colors' as clr;
	@use '../../../../styles/forms' as forms;
	@use '../../../../styles/variables' as vars;

	.code-block-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.3rem;
		padding: 0.3rem 0.3rem 0;

		> select {
			min-height: vars.$touchTarget;
			padding: 0 0.5rem;
			font: inherit;
			font-size: 0.72rem;
			color: clr.$textSecondaryColor;
			background-color: clr.$surfaceColor;
			border: 1px solid clr.$borderSubtleColor;
			border-radius: vars.$radius;
		}

		> button {
			@include forms.toolButton;
		}
	}

	pre {
		margin: 0;
		padding: 0.4rem 0.9rem 0.8rem;
		overflow-x: auto;
		font-size: 0.84rem;
		line-height: 1.6;

		// Highlighting spans are rendered by lowlight inside the editable code.
		:global(.hljs-comment),
		:global(.hljs-quote) {
			font-style: italic;
			color: clr.$textMutedColor;
		}

		:global(.hljs-keyword),
		:global(.hljs-selector-tag),
		:global(.hljs-literal),
		:global(.hljs-built_in),
		:global(.hljs-meta) {
			color: clr.$codeKeywordColor;
		}

		:global(.hljs-string),
		:global(.hljs-regexp),
		:global(.hljs-addition),
		:global(.hljs-attr),
		:global(.hljs-template-variable) {
			color: clr.$codeStringColor;
		}

		:global(.hljs-number),
		:global(.hljs-symbol),
		:global(.hljs-bullet),
		:global(.hljs-variable) {
			color: clr.$codeNumberColor;
		}

		:global(.hljs-title),
		:global(.hljs-section),
		:global(.hljs-name),
		:global(.hljs-type),
		:global(.hljs-attribute) {
			color: clr.$codeTitleColor;
		}

		:global(.hljs-deletion) {
			color: clr.$errorColor;
		}
	}
</style>
