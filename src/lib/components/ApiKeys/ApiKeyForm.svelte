<script lang="ts">
	import { enhance } from '$app/forms';
	import { readScopeFor, scopeGroups } from '$lib/modules/scopes';
	import { m } from '$lib/paraglide/messages.js';
	import { API_KEY_NAME_MAX_LENGTH } from '$lib/schemas/api-keys';
	import { getNotifications } from '$lib/state/notifications.svelte';
	import { getStepUp, needsStepUp } from '$lib/state/step-up.svelte';
	import type { FieldErrors } from '$lib/types/validation';
	import { localizedHref } from '$lib/utils/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';

	interface Props {
		errors: FieldErrors;
		/** Set when the owner could not use the dialog (no JavaScript). */
		stepUpNeeded: boolean;
	}

	let { errors, stepUpNeeded }: Props = $props();

	const notifications = getNotifications();
	const stepUp = getStepUp();
	const groups = scopeGroups();

	let selected = $state<string[]>([]);

	/** Choosing a write scope chooses its read scope too; it can still be cleared by hand. */
	function toggle(scopeId: string, checked: boolean): void {
		if (!checked) {
			selected = selected.filter((item) => item !== scopeId);
			return;
		}
		const read = readScopeFor(scopeId);
		selected = [...new Set([...selected, scopeId, ...(read === null ? [] : [read])])];
	}

	const submit: SubmitFunction = ({ formElement, submitter }) => {
		return async ({ result, update }) => {
			if (needsStepUp(result)) {
				if (await stepUp.request()) {
					formElement.requestSubmit(submitter);
				}
				return;
			}
			if (result.type === 'success') {
				notifications.confirm(m.api_keys_created());
				selected = [];
			}
			await update();
		};
	};
</script>

<form method="POST" action="?/create" use:enhance={submit} class="create" novalidate>
	<div class="field">
		<label for="apiKeyName">{m.api_keys_name()}</label>
		<input
			id="apiKeyName"
			name="name"
			type="text"
			autocomplete="off"
			maxlength={API_KEY_NAME_MAX_LENGTH}
			aria-invalid={(errors.name ?? '').length > 0}
			aria-describedby="apiKeyNameError"
		/>
		<p class="error" id="apiKeyNameError">{errors.name ?? ''}</p>
	</div>
	<fieldset class="scopes" aria-describedby="apiKeyScopesError">
		<legend>{m.api_keys_scopes()}</legend>
		{#each groups as group (group.id)}
			<div class="group">
				<p class="group-name">{group.label()}</p>
				{#each group.scopes as scope (scope.id)}
					<label class="scope">
						<input
							type="checkbox"
							name="scopes"
							value={scope.id}
							checked={selected.includes(scope.id)}
							onchange={(event) => toggle(scope.id, event.currentTarget.checked)}
						/>
						<span>{scope.label()}</span>
						<code>{scope.id}</code>
					</label>
				{/each}
			</div>
		{/each}
	</fieldset>
	<p class="error" id="apiKeyScopesError">{errors.scopes ?? ''}</p>
	<div class="field">
		<label for="apiKeyExpires">{m.api_keys_expires()}</label>
		<input
			id="apiKeyExpires"
			name="expires"
			type="date"
			aria-invalid={(errors.expires ?? '').length > 0}
			aria-describedby="apiKeyExpiresHint apiKeyExpiresError"
		/>
		<p class="hint" id="apiKeyExpiresHint">{m.api_keys_expires_hint()}</p>
		<p class="error" id="apiKeyExpiresError">{errors.expires ?? ''}</p>
	</div>
	<div class="field">
		<label class="check">
			<input type="checkbox" name="vault" aria-describedby="apiKeyVaultHint" />
			<span>{m.api_keys_vault()}</span>
		</label>
		<p class="hint" id="apiKeyVaultHint">{m.api_keys_vault_hint()}</p>
	</div>
	<div class="submit">
		<p class="notice" role="alert">
			{#if stepUpNeeded}
				{m.step_up_required()}
				<a
					href="{localizedHref('/step-up')}?redirectTo={encodeURIComponent(
						'/settings/api-keys'
					)}"
				>
					{m.step_up_link()}
				</a>
			{/if}
		</p>
		<button type="submit">{m.api_keys_create()}</button>
	</div>
</form>

<style lang="scss">
	@use '../../../styles/colors' as clr;
	@use '../../../styles/forms' as forms;
	@use '../../../styles/variables' as vars;

	.create {
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
	}

	.field {
		> label:not(.check) {
			@include forms.fieldLabel;
		}

		> .check {
			display: inline-flex;
			align-items: center;
			gap: 0.6rem;
			min-height: vars.$touchTarget;
			font-size: 0.8rem;
			color: clr.$textSecondaryColor;
			cursor: pointer;

			> input {
				width: 1.1rem;
				height: 1.1rem;
				accent-color: clr.$accentColor;
			}
		}

		> input {
			@include forms.textInput;
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

	.scopes {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
		gap: 1rem;
		margin: 0;
		padding: 0;
		border: 0;

		> legend {
			@include forms.fieldLabel;
			padding: 0;
		}

		> .group {
			display: flex;
			flex-direction: column;
			gap: 0.2rem;
			padding: 0.7rem 0.8rem;
			border: 1px solid clr.$borderSubtleColor;
			border-radius: vars.$radius;

			> .group-name {
				font-size: 0.78rem;
				color: clr.$textPrimaryColor;
			}

			> .scope {
				display: flex;
				align-items: center;
				gap: 0.5rem;
				min-height: vars.$touchTarget;
				font-size: 0.8rem;
				color: clr.$textSecondaryColor;
				cursor: pointer;

				> input {
					width: 1.1rem;
					height: 1.1rem;
					accent-color: clr.$accentColor;
				}

				> code {
					margin-left: auto;
					font-size: 0.68rem;
					color: clr.$textMutedColor;
				}
			}
		}
	}

	.error {
		@include forms.fieldError;
	}

	.submit {
		@include forms.submitGroup;

		> button {
			@include forms.primaryButton;
			align-self: flex-start;
		}
	}

	.notice {
		@include forms.formNotice;

		> a {
			color: clr.$accentColor;
		}
	}

	@media (max-width: vars.$mobileMax) {
		.submit > button {
			align-self: stretch;
		}
	}
</style>
