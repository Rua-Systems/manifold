<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '$lib/paraglide/messages.js';
	import { Field, validateAll } from '$lib/state/field.svelte';
	import type { FieldErrors } from '$lib/types/validation';
	import { fromSchema } from '$lib/utils/validation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { untrack } from 'svelte';
	import {
		BASEMAP_DEFAULT_MAX_ZOOM,
		BASEMAP_MAX_ZOOM,
		basemapAttributionSchema,
		basemapMaxZoomSchema,
		basemapNameSchema,
		basemapUrlSchema,
		TILE_PLACEHOLDERS,
		type Basemap
	} from '../map/basemaps';

	interface Props {
		/** The basemap being edited, or null to add a new one. */
		basemap: Basemap | null;
		serverErrors: FieldErrors;
		serverMessage: string;
		onsaved: (message: string) => void;
	}

	let { basemap, serverErrors, serverMessage, onsaved }: Props = $props();

	const initial = untrack(() => basemap);
	const nameField = new Field([fromSchema(basemapNameSchema)], initial?.name ?? '');
	const urlField = new Field([fromSchema(basemapUrlSchema)], initial?.url ?? '');
	const attributionField = new Field(
		[fromSchema(basemapAttributionSchema)],
		initial?.attribution ?? ''
	);
	const maxZoomField = new Field(
		[fromSchema(basemapMaxZoomSchema)],
		String(initial?.maxZoom ?? BASEMAP_DEFAULT_MAX_ZOOM)
	);

	let submitted = $state(false);

	function formSetup(existing: Basemap | null): { action: string; submitLabel: string } {
		if (existing === null) {
			return { action: '?/create', submitLabel: m.basemaps_add() };
		}
		return { action: '?/update', submitLabel: m.common_save() };
	}

	const { action, submitLabel } = formSetup(initial);

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

	const submit: SubmitFunction = ({ cancel }) => {
		if (!validateAll([nameField, urlField, attributionField, maxZoomField])) {
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
		<label for="basemapName">{m.field_basemap_name()}</label>
		<input
			id="basemapName"
			name="name"
			type="text"
			autocomplete="off"
			aria-invalid={errorFor(nameField, 'name').length > 0}
			aria-describedby="basemapNameError"
			bind:value={nameField.value}
			onblur={() => nameField.markTouched()}
		/>
		<p class="error" id="basemapNameError">{errorFor(nameField, 'name')}</p>
	</div>
	<div class="field">
		<label for="basemapUrl">{m.field_basemap_url()}</label>
		<input
			id="basemapUrl"
			name="url"
			type="url"
			inputmode="url"
			autocomplete="off"
			spellcheck="false"
			placeholder="https://"
			aria-invalid={errorFor(urlField, 'url').length > 0}
			aria-describedby="basemapUrlHint basemapUrlError"
			bind:value={urlField.value}
			onblur={() => urlField.markTouched()}
		/>
		<p class="hint" id="basemapUrlHint">
			{m.basemaps_url_hint({
				placeholders: TILE_PLACEHOLDERS,
				example: 'https://tile.example.com/{z}/{x}/{y}.png',
				extras: '{-y}, {a-c}, {s}'
			})}
		</p>
		<p class="error" id="basemapUrlError">{errorFor(urlField, 'url')}</p>
	</div>
	<div class="field">
		<label for="basemapAttribution">{m.field_basemap_attribution()}</label>
		<input
			id="basemapAttribution"
			name="attribution"
			type="text"
			autocomplete="off"
			aria-invalid={errorFor(attributionField, 'attribution').length > 0}
			aria-describedby="basemapAttributionHint basemapAttributionError"
			bind:value={attributionField.value}
			onblur={() => attributionField.markTouched()}
		/>
		<p class="hint" id="basemapAttributionHint">{m.basemaps_attribution_hint()}</p>
		<p class="error" id="basemapAttributionError">
			{errorFor(attributionField, 'attribution')}
		</p>
	</div>
	<div class="field">
		<label for="basemapMaxZoom">{m.field_basemap_max_zoom()}</label>
		<input
			id="basemapMaxZoom"
			name="maxZoom"
			type="number"
			inputmode="numeric"
			min="0"
			max={BASEMAP_MAX_ZOOM}
			step="1"
			aria-invalid={errorFor(maxZoomField, 'maxZoom').length > 0}
			aria-describedby="basemapMaxZoomError"
			bind:value={maxZoomField.value}
			onblur={() => maxZoomField.markTouched()}
		/>
		<p class="error" id="basemapMaxZoomError">{errorFor(maxZoomField, 'maxZoom')}</p>
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

		> .hint {
			margin-top: 0.4rem;
			font-size: 0.68rem;
			line-height: 1.5;
			color: clr.$textMutedColor;
			overflow-wrap: anywhere;
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
