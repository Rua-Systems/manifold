<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '$lib/paraglide/messages.js';
	import { Field, validateAll } from '$lib/state/field.svelte';
	import type { FieldErrors } from '$lib/types/validation';
	import { formatMegabytes } from '$lib/utils/format';
	import { fromSchema } from '$lib/utils/validation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { onDestroy, untrack } from 'svelte';
	import { serviceAliasSchema, serviceUrlSchema } from '../schemas';
	import type { ServiceView } from '../types';
	import ServiceIcon from './ServiceIcon.svelte';

	interface Props {
		/** The service being edited, or null to add a new one. */
		service: ServiceView | null;
		uploadMaxBytes: number;
		serverErrors: FieldErrors;
		serverMessage: string;
		onsaved: (message: string) => void;
	}

	let { service, uploadMaxBytes, serverErrors, serverMessage, onsaved }: Props = $props();

	const initial = untrack(() => service);
	const aliasField = new Field([fromSchema(serviceAliasSchema)], initial?.alias ?? '');
	const urlField = new Field([fromSchema(serviceUrlSchema)], initial?.url ?? '');

	let iconError = $state('');
	let previewUrl = $state<string | null>(null);
	let removeIcon = $state(false);
	let submitted = $state(false);

	function formSetup(existing: ServiceView | null): { action: string; submitLabel: string } {
		if (existing === null) {
			return { action: '?/create', submitLabel: m.services_add() };
		}
		return { action: '?/update', submitLabel: m.common_save() };
	}

	const { action, submitLabel } = formSetup(initial);

	const shownIcon = $derived.by(() => {
		if (previewUrl !== null) {
			return previewUrl;
		}
		if (removeIcon || service === null) {
			return null;
		}
		return service.iconSrc;
	});

	const initialLetter = $derived(
		(Array.from(aliasField.value.trim())[0] ?? '?').toLocaleUpperCase()
	);

	function errorFor(field: Field, name: string): string {
		if (field.message.length > 0) {
			return field.message;
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

	const iconMessage = $derived.by(() => {
		if (iconError.length > 0) {
			return iconError;
		}
		if (!submitted) {
			return '';
		}
		return serverErrors.icon ?? '';
	});

	function releasePreview(): void {
		if (previewUrl !== null) {
			URL.revokeObjectURL(previewUrl);
			previewUrl = null;
		}
	}

	function onIconChange(event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		const chosen = input.files?.[0];
		releasePreview();
		iconError = '';

		if (chosen === undefined) {
			return;
		}
		if (chosen.size > uploadMaxBytes) {
			iconError = m.validation_file_too_large({ max: formatMegabytes(uploadMaxBytes) });
			input.value = '';
			return;
		}
		previewUrl = URL.createObjectURL(chosen);
		removeIcon = false;
	}

	onDestroy(releasePreview);

	const submit: SubmitFunction = ({ cancel }) => {
		if (!validateAll([aliasField, urlField]) || iconError.length > 0) {
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

<form method="POST" {action} enctype="multipart/form-data" use:enhance={submit} novalidate>
	{#if initial !== null}
		<input type="hidden" name="id" value={initial.id} />
	{/if}
	<div class="field">
		<label for="serviceAlias">{m.field_service_alias()}</label>
		<input
			id="serviceAlias"
			name="alias"
			type="text"
			autocomplete="off"
			aria-invalid={errorFor(aliasField, 'alias').length > 0}
			aria-describedby="serviceAliasError"
			bind:value={aliasField.value}
			onblur={() => aliasField.markTouched()}
		/>
		<p class="error" id="serviceAliasError">{errorFor(aliasField, 'alias')}</p>
	</div>
	<div class="field">
		<label for="serviceUrl">{m.field_service_url()}</label>
		<input
			id="serviceUrl"
			name="url"
			type="url"
			inputmode="url"
			autocomplete="url"
			placeholder="https://"
			aria-invalid={errorFor(urlField, 'url').length > 0}
			aria-describedby="serviceUrlError"
			bind:value={urlField.value}
			onblur={() => urlField.markTouched()}
		/>
		<p class="error" id="serviceUrlError">{errorFor(urlField, 'url')}</p>
	</div>
	<div class="field">
		<label for="serviceIcon">{m.field_service_icon()}</label>
		<div class="icon-row">
			<ServiceIcon iconSrc={shownIcon} initial={initialLetter} size="3rem" />
			<div class="icon-controls">
				<input
					id="serviceIcon"
					name="icon"
					type="file"
					accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
					aria-invalid={iconMessage.length > 0}
					aria-describedby="serviceIconHint serviceIconError"
					onchange={onIconChange}
				/>
				<p class="hint" id="serviceIconHint">
					{m.services_icon_hint({ max: formatMegabytes(uploadMaxBytes) })}
				</p>
				{#if initial?.iconSrc}
					<label class="check">
						<input type="checkbox" name="removeIcon" bind:checked={removeIcon} />
						<span>{m.services_remove_icon()}</span>
					</label>
				{/if}
			</div>
		</div>
		<p class="error" id="serviceIconError">{iconMessage}</p>
	</div>
	<div class="submit">
		<p class="notice" role="alert">{notice}</p>
		<button type="submit">{submitLabel}</button>
	</div>
</form>

<style lang="scss">
	@use '../../../../styles/colors' as clr;
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

	.icon-row {
		display: flex;
		align-items: flex-start;
		gap: 1rem;
	}

	.icon-controls {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 0.5rem;
		min-width: 0;

		> input[type='file'] {
			min-height: vars.$touchTarget;
			font: inherit;
			font-size: 0.78rem;
			color: clr.$textSecondaryColor;
		}

		> .hint {
			font-size: 0.68rem;
			color: clr.$textMutedColor;
		}
	}

	.check {
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
		min-height: vars.$touchTarget;
		font-size: 0.78rem;
		color: clr.$textSecondaryColor;
		cursor: pointer;

		> input {
			width: 1.1rem;
			height: 1.1rem;
			accent-color: clr.$accentColor;
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
