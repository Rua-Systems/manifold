<script lang="ts">
	import { enhance } from '$app/forms';
	import { Field, validateAll } from '$lib/state/field.svelte';
	import type { FieldErrors } from '$lib/types/validation';
	import { fromSchema } from '$lib/utils/validation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { untrack } from 'svelte';
	import type { z } from 'zod';

	interface Props {
		/** The form action, such as `?/createFolder`. */
		action: string;
		/** Hidden fields sent along, such as the id of what is renamed. */
		fields: Record<string, string>;
		id: string;
		label: string;
		initial: string;
		schema: z.ZodType<string>;
		submitLabel: string;
		serverErrors: FieldErrors;
		serverMessage: string;
		onsaved: (message: string) => void;
	}

	let {
		action,
		fields,
		id,
		label,
		initial,
		schema,
		submitLabel,
		serverErrors,
		serverMessage,
		onsaved
	}: Props = $props();

	const nameField = new Field(
		[fromSchema(untrack(() => schema))],
		untrack(() => initial)
	);
	let submitted = $state(false);

	const error = $derived.by(() => {
		if (nameField.message.length > 0) {
			return nameField.message;
		}
		if (!submitted) {
			return '';
		}
		return serverErrors.name ?? '';
	});

	const notice = $derived.by(() => {
		if (!submitted || serverErrors.name !== undefined) {
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
	{#each Object.entries(fields) as [name, value] (name)}
		<input type="hidden" {name} {value} />
	{/each}
	<div class="field">
		<label for={id}>{label}</label>
		<input
			{id}
			name="name"
			type="text"
			autocomplete="off"
			aria-invalid={error.length > 0}
			aria-describedby="{id}Error"
			bind:value={nameField.value}
			onblur={() => nameField.markTouched()}
		/>
		<p class="error" id="{id}Error">{error}</p>
	</div>
	<div class="submit">
		<p class="notice" role="alert">{notice}</p>
		<button type="submit">{submitLabel}</button>
	</div>
</form>

<style lang="scss">
	@use '../../../../styles/forms' as forms;
	@use '../../../../styles/variables' as vars;

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
		.submit > button {
			align-self: stretch;
		}
	}
</style>
