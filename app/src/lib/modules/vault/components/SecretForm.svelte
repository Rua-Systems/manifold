<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '$lib/paraglide/messages.js';
	import { getStepUp, needsStepUp } from '$lib/state/step-up.svelte';
	import type { FieldErrors } from '$lib/types/validation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import {
		SECRET_DESCRIPTION_MAX_LENGTH,
		SECRET_NAME_MAX_LENGTH,
		SECRET_VALUE_MAX_LENGTH
	} from '../schemas';
	import type { VaultSecretView } from '../types';

	interface Props {
		/** Null to add a secret. */
		secret: VaultSecretView | null;
		onsaved: (message: string) => void;
	}

	let { secret, onsaved }: Props = $props();

	const stepUp = getStepUp();
	const prefix = $derived(secret === null ? 'secretNew' : 'secretEdit');

	let errors = $state<FieldErrors>({});

	const submit: SubmitFunction = ({ formElement, submitter }) => {
		return async ({ result, update }) => {
			if (needsStepUp(result)) {
				if (await stepUp.request()) {
					formElement.requestSubmit(submitter);
				}
				return;
			}
			if (result.type === 'failure') {
				errors = (result.data?.errors as FieldErrors | undefined) ?? {};
				return;
			}
			if (result.type === 'success') {
				errors = {};
				onsaved(typeof result.data?.message === 'string' ? result.data.message : '');
			}
			await update();
		};
	};
</script>

<form
	method="POST"
	action={secret === null ? '?/create' : '?/update'}
	class="secret-form"
	use:enhance={submit}
	novalidate
>
	{#if secret !== null}
		<input type="hidden" name="id" value={secret.id} />
	{/if}
	<div class="field">
		<label for="{prefix}Name">{m.vault_name()}</label>
		<input
			id="{prefix}Name"
			name="name"
			type="text"
			autocomplete="off"
			maxlength={SECRET_NAME_MAX_LENGTH}
			value={secret?.name ?? ''}
			aria-invalid={(errors.name ?? '').length > 0}
			aria-describedby="{prefix}NameError"
		/>
		<p class="error" id="{prefix}NameError">{errors.name ?? ''}</p>
	</div>
	<div class="field">
		<label for="{prefix}Url">{m.vault_service_url()}</label>
		<input
			id="{prefix}Url"
			name="serviceUrl"
			type="url"
			inputmode="url"
			autocomplete="off"
			placeholder="https://"
			value={secret?.serviceUrl ?? ''}
			aria-invalid={(errors.serviceUrl ?? '').length > 0}
			aria-describedby="{prefix}UrlError"
		/>
		<p class="error" id="{prefix}UrlError">{errors.serviceUrl ?? ''}</p>
	</div>
	<div class="field">
		<label for="{prefix}Description">{m.vault_description()}</label>
		<textarea
			id="{prefix}Description"
			name="description"
			rows="3"
			maxlength={SECRET_DESCRIPTION_MAX_LENGTH}
			aria-invalid={(errors.description ?? '').length > 0}
			aria-describedby="{prefix}DescriptionError">{secret?.description ?? ''}</textarea
		>
		<p class="error" id="{prefix}DescriptionError">{errors.description ?? ''}</p>
	</div>
	<div class="field">
		<label for="{prefix}Value">
			{secret === null ? m.vault_value() : m.vault_new_value()}
		</label>
		<input
			id="{prefix}Value"
			name="value"
			type="password"
			autocomplete="new-password"
			maxlength={SECRET_VALUE_MAX_LENGTH}
			aria-invalid={(errors.value ?? '').length > 0}
			aria-describedby="{prefix}ValueHint {prefix}ValueError"
		/>
		<p class="hint" id="{prefix}ValueHint">
			{secret === null ? m.vault_value_hint() : m.vault_new_value_hint()}
		</p>
		<p class="error" id="{prefix}ValueError">{errors.value ?? ''}</p>
	</div>
	<button type="submit">{secret === null ? m.vault_add() : m.common_save()}</button>
</form>

<style lang="scss">
	@use '../../../../styles/colors' as clr;
	@use '../../../../styles/forms' as forms;

	.secret-form {
		display: flex;
		flex-direction: column;
		gap: 1rem;

		> button {
			@include forms.primaryButton;
			align-self: flex-start;
		}
	}

	.field {
		> label {
			@include forms.fieldLabel;
		}

		> input,
		> textarea {
			@include forms.textInput;
		}

		> textarea {
			resize: vertical;
		}

		> .hint {
			margin-top: 0.35rem;
			font-size: 0.7rem;
			color: clr.$textMutedColor;
		}

		> .error {
			@include forms.fieldError;
		}
	}
</style>
