<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { untrack } from 'svelte';
	import { getEditor } from '../tiptap/index.ts';

	interface Props {
		isAllowedLink: (url: string) => boolean;
		onclose: () => void;
	}

	let { isAllowedLink, onclose }: Props = $props();

	const editor = getEditor();

	let href = $state(untrack(() => String(editor.getAttributes('link').href ?? '')));
	let error = $state('');

	function apply(event: SubmitEvent): void {
		event.preventDefault();
		const value = href.trim();
		if (!isAllowedLink(value)) {
			error = m.notes_error_link();
			return;
		}
		editor.chain().focus().extendMarkRange('link').setLink({ href: value }).run();
		onclose();
	}

	function remove(): void {
		editor.chain().focus().extendMarkRange('link').unsetLink().run();
		onclose();
	}

	function onKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			editor.commands.focus();
			onclose();
		}
	}
</script>

<form class="link-form" onsubmit={apply} novalidate>
	<label class="visually-hidden" for="editorLinkInput">{m.editor_link_address()}</label>
	<input
		id="editorLinkInput"
		type="url"
		inputmode="url"
		placeholder="https://"
		autocomplete="off"
		aria-invalid={error.length > 0}
		aria-describedby="editorLinkError"
		bind:value={href}
		oninput={() => (error = '')}
		onkeydown={onKeydown}
	/>
	<button type="submit" class="apply">{m.editor_link_apply()}</button>
	<button type="button" class="quiet" onclick={remove}>{m.editor_link_remove()}</button>
	<button type="button" class="quiet" onclick={onclose}>{m.common_cancel()}</button>
	<p class="error" id="editorLinkError">{error}</p>
</form>

<style lang="scss">
	@use '../../../../styles/colors' as clr;
	@use '../../../../styles/forms' as forms;

	.link-form {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.4rem;

		> input {
			@include forms.textInput;
			flex: 1 1 14rem;
			width: auto;
		}

		> .apply {
			@include forms.primaryButton;
		}

		> .quiet {
			@include forms.quietButton;
			padding-inline: 0.4rem;
		}

		> .error {
			@include forms.fieldError;
			flex-basis: 100%;
			margin-top: 0;
		}
	}
</style>
