<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '$lib/paraglide/messages.js';
	import { tagNameSchema } from '$lib/schemas/tags';
	import { Field, validateAll } from '$lib/state/field.svelte';
	import { TAG_COLORS, type Tag, type TagColor } from '$lib/types/tags';
	import type { FieldErrors } from '$lib/types/validation';
	import { fromSchema } from '$lib/utils/validation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { untrack } from 'svelte';
	import { TAG_COLOR_LABELS } from './labels';

	interface Props {
		/** The tag being edited, or null to make a new one. */
		tag: Tag | null;
		serverErrors: FieldErrors;
		serverMessage: string;
		onsaved: (message: string) => void;
	}

	let { tag, serverErrors, serverMessage, onsaved }: Props = $props();

	const initial = untrack(() => tag);
	const nameField = new Field([fromSchema(tagNameSchema)], initial?.name ?? '');
	let color = $state<TagColor>(initial?.color ?? 'gray');

	let submitted = $state(false);

	function formSetup(existing: Tag | null): { action: string; submitLabel: string } {
		if (existing === null) {
			return { action: '?/create', submitLabel: m.tags_add() };
		}
		return { action: '?/update', submitLabel: m.common_save() };
	}

	const { action, submitLabel } = formSetup(initial);

	function errorFor(name: string): string {
		if (name === 'name' && nameField.message.length > 0) {
			return nameField.message;
		}
		if (!submitted) {
			return '';
		}
		return serverErrors[name] ?? '';
	}

	const notice = $derived.by(() => {
		if (!submitted) {
			return '';
		}
		return serverMessage;
	});

	const submit: SubmitFunction = ({ cancel }) => {
		if (!validateAll([nameField])) {
			cancel();
			return;
		}
		submitted = false;

		return async ({ result, update }) => {
			submitted = true;
			if (result.type === 'success' && typeof result.data?.message === 'string') {
				onsaved(result.data.message);
			}
			await update({ reset: false });
		};
	};
</script>

<form method="POST" {action} use:enhance={submit} novalidate>
	{#if initial !== null}
		<input type="hidden" name="id" value={initial.id} />
	{/if}
	<div class="field">
		<label for="tagName">{m.field_tag_name()}</label>
		<input
			id="tagName"
			name="name"
			type="text"
			autocomplete="off"
			aria-invalid={errorFor('name').length > 0}
			aria-describedby="tagNameError"
			bind:value={nameField.value}
			onblur={() => nameField.markTouched()}
		/>
		<p class="error" id="tagNameError">{errorFor('name')}</p>
	</div>
	<div class="field">
		<fieldset class="colors" aria-describedby="tagColorError">
			<legend>{m.field_tag_color()}</legend>
			{#each TAG_COLORS as option (option)}
				<label style:--tagColor="var(--color-tag-{option})">
					<input type="radio" name="color" value={option} bind:group={color} />
					<span>{TAG_COLOR_LABELS[option]()}</span>
				</label>
			{/each}
		</fieldset>
		<p class="error" id="tagColorError">{errorFor('color')}</p>
	</div>
	<div class="submit">
		<p class="notice" role="alert">{notice}</p>
		<button type="submit">{submitLabel}</button>
	</div>
</form>

<style lang="scss">
	@use '../../../styles/colors' as clr;
	@use '../../../styles/forms' as forms;
	@use '../../../styles/variables' as vars;

	form {
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
	}

	.field {
		> label {
			@include forms.fieldLabel;
		}

		> input {
			@include forms.textInput;
		}

		> .error {
			@include forms.fieldError;
		}
	}

	.colors {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.2rem 0.8rem;
		margin: 0;
		padding: 0;
		border: 0;

		> legend {
			@include forms.fieldLabel;
			padding: 0;
		}

		> label {
			display: inline-flex;
			align-items: center;
			gap: 0.5rem;
			min-height: vars.$touchTarget;
			font-size: 0.82rem;
			color: clr.$textSecondaryColor;
			cursor: pointer;

			> input {
				width: 1.05rem;
				height: 1.05rem;
				margin: 0;
				accent-color: var(--tagColor);
			}

			> span::before {
				content: '';
				display: inline-block;
				width: 0.55rem;
				height: 0.55rem;
				margin-right: 0.4rem;
				background-color: var(--tagColor);
				border-radius: 50%;
			}
		}
	}

	.submit {
		@include forms.submitGroup;

		> button {
			@include forms.primaryButton;
			align-self: flex-end;
		}
	}

	.notice {
		@include forms.formNotice;
	}

	@media (max-width: vars.$mobileMax) {
		.colors {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.submit > button {
			align-self: stretch;
		}
	}
</style>
