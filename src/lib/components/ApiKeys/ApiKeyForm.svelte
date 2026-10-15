<script lang="ts">
	import { enhance } from '$app/forms';
	import type { MemoryCategory } from '$lib/modules/memory/types';
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
		/** The categories a key with a memory scope can be limited to. */
		memoryCategories: MemoryCategory[];
	}

	let { errors, stepUpNeeded, memoryCategories }: Props = $props();

	const notifications = getNotifications();
	const stepUp = getStepUp();
	const groups = scopeGroups();

	let selected = $state<string[]>([]);

	const reachesMemory = $derived(selected.some((scope) => scope.startsWith('memory:')));
	const topCategories = $derived(
		memoryCategories.filter((category) => category.parentId === null)
	);

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
						<span class="text">
							<span>{scope.label()}</span>
							<code>{scope.id}</code>
						</span>
					</label>
				{/each}
			</div>
		{/each}
	</fieldset>
	<p class="error" id="apiKeyScopesError">{errors.scopes ?? ''}</p>
	{#if reachesMemory && memoryCategories.length > 0}
		<fieldset class="limits" aria-describedby="apiKeyMemoryHint apiKeyMemoryError">
			<legend>{m.api_keys_memory_categories()}</legend>
			<p class="hint" id="apiKeyMemoryHint">{m.api_keys_memory_categories_hint()}</p>
			{#each topCategories as category (category.id)}
				<label class="scope">
					<input type="checkbox" name="memoryCategories" value={category.id} />
					<span>{category.name}</span>
				</label>
				{#each memoryCategories.filter((child) => child.parentId === category.id) as child (child.id)}
					<label class="scope sub">
						<input type="checkbox" name="memoryCategories" value={child.id} />
						<span>{category.name} / {child.name}</span>
					</label>
				{/each}
			{/each}
			<p class="error" id="apiKeyMemoryError">{errors.memoryCategories ?? ''}</p>
		</fieldset>
	{/if}
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

			// The label and the scope id stack and wrap, so long labels such as those of data
			// sources stay inside a narrow card instead of running past its edge.
			> .scope {
				display: flex;
				align-items: flex-start;
				gap: 0.5rem;
				min-height: vars.$touchTarget;
				padding-block: 0.4rem;
				font-size: 0.8rem;
				line-height: 1.35;
				color: clr.$textSecondaryColor;
				cursor: pointer;

				> input {
					flex: none;
					width: 1.1rem;
					height: 1.1rem;
					margin: 0;
					accent-color: clr.$accentColor;
				}

				> .text {
					display: flex;
					flex-direction: column;
					gap: 0.1rem;
					min-width: 0;
					overflow-wrap: anywhere;

					> code {
						font-size: 0.68rem;
						color: clr.$textMutedColor;
					}
				}
			}
		}
	}

	.limits {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		margin: 0;
		padding: 0.7rem 0.8rem;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radius;

		> legend {
			@include forms.fieldLabel;
			padding: 0 0.3rem;
		}

		> .hint {
			margin-bottom: 0.3rem;
			font-size: 0.7rem;
			color: clr.$textMutedColor;
		}

		> .scope {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			min-height: vars.$touchTarget;
			font-size: 0.8rem;
			color: clr.$textSecondaryColor;
			cursor: pointer;

			&.sub {
				padding-left: 1.4rem;
			}

			> input {
				width: 1.1rem;
				height: 1.1rem;
				accent-color: clr.$accentColor;
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
