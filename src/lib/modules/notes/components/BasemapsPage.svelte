<script lang="ts">
	import { enhance } from '$app/forms';
	import ConfirmDialog from '$lib/components/ConfirmDialog/ConfirmDialog.svelte';
	import Dialog from '$lib/components/Dialog/Dialog.svelte';
	import ArrowDownIcon from '$lib/components/icons/ArrowDownIcon.svelte';
	import ArrowUpIcon from '$lib/components/icons/ArrowUpIcon.svelte';
	import PencilIcon from '$lib/components/icons/PencilIcon.svelte';
	import TrashIcon from '$lib/components/icons/TrashIcon.svelte';
	import PageShell from '$lib/components/PageShell/PageShell.svelte';
	import SettingsNav from '$lib/components/SettingsNav/SettingsNav.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { getNotifications } from '$lib/state/notifications.svelte';
	import type { FieldErrors } from '$lib/types/validation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { Basemap, BasemapsAction, BasemapsFormState } from '../map/basemaps';
	import BasemapForm from './BasemapForm.svelte';

	interface Props {
		basemaps: Basemap[];
		/** The tile address of the standard basemap, from `MAP_TILE_URL`. */
		standardUrl: string;
		form: BasemapsFormState | null | undefined;
	}

	let { basemaps, standardUrl, form }: Props = $props();

	const notifications = getNotifications();

	let createOpen = $state(false);
	let editOpen = $state(false);
	let deleteOpen = $state(false);
	let editing = $state<Basemap | null>(null);
	let deleting = $state<Basemap | null>(null);

	const standardInUse = $derived(basemaps.every((basemap) => !basemap.inUse));

	function errorsFor(action: BasemapsAction): FieldErrors {
		if (form?.action !== action || form.success) {
			return {};
		}
		return form.errors;
	}

	function messageFor(action: BasemapsAction): string {
		if (form?.action !== action || form.success) {
			return '';
		}
		return form.message;
	}

	function startEdit(basemap: Basemap): void {
		editing = basemap;
		editOpen = true;
	}

	function startDelete(basemap: Basemap): void {
		deleting = basemap;
		deleteOpen = true;
	}

	function onCreated(message: string): void {
		createOpen = false;
		notifications.confirm(message);
	}

	function onUpdated(message: string): void {
		editOpen = false;
		notifications.confirm(message);
	}

	const notifyResult: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'success' && typeof result.data?.message === 'string') {
				notifications.confirm(result.data.message);
			}
			if (result.type === 'failure' && typeof result.data?.message === 'string') {
				notifications.fault(result.data.message);
			}
			await update({ reset: false });
		};
	};

	const deleteResult: SubmitFunction = (input) => {
		deleteOpen = false;
		return notifyResult(input);
	};
</script>

{#snippet useControl(id: string, label: string, inUse: boolean)}
	{#if inUse}
		<span class="badge">{m.basemaps_in_use()}</span>
	{:else}
		<form method="POST" action="?/use" use:enhance={notifyResult}>
			<input type="hidden" name="id" value={id} />
			<button type="submit" class="use" aria-label={m.basemaps_use_named({ name: label })}>
				{m.basemaps_use()}
			</button>
		</form>
	{/if}
{/snippet}

<PageShell
	title={m.basemaps_title()}
	sigil={m.account_sigil()}
	metaDescription={m.basemaps_meta_description()}
>
	<SettingsNav />
	<section class="section" aria-labelledby="basemapsHeading">
		<div class="heading">
			<h2 id="basemapsHeading">{m.basemaps_heading()}</h2>
			<button type="button" class="primary" onclick={() => (createOpen = true)}>
				{m.basemaps_new()}
			</button>
		</div>
		<p class="lead">{m.basemaps_lead()}</p>
		<ol class="list" aria-label={m.basemaps_heading()}>
			<li class="card" class:in-use={standardInUse}>
				<div class="text">
					<span class="name">{m.map_basemap_standard()}</span>
					<span class="url">{standardUrl}</span>
					<span class="note">
						{m.basemaps_standard_source({ variable: 'MAP_TILE_URL' })}
					</span>
				</div>
				<div class="actions">
					{@render useControl('', m.map_basemap_standard(), standardInUse)}
				</div>
			</li>
			{#each basemaps as basemap, index (basemap.id)}
				<li class="card" class:in-use={basemap.inUse}>
					<div class="text">
						<span class="name">{basemap.name}</span>
						<span class="url">{basemap.url}</span>
						{#if basemap.attribution !== ''}
							<span class="note">{basemap.attribution}</span>
						{/if}
					</div>
					<div class="actions">
						{@render useControl(basemap.id, basemap.name, basemap.inUse)}
						<form method="POST" action="?/move" use:enhance={notifyResult}>
							<input type="hidden" name="id" value={basemap.id} />
							<input type="hidden" name="direction" value="up" />
							<button
								type="submit"
								class="icon-button"
								aria-label={m.basemaps_move_up({ name: basemap.name })}
								disabled={index === 0}
							>
								<ArrowUpIcon />
							</button>
						</form>
						<form method="POST" action="?/move" use:enhance={notifyResult}>
							<input type="hidden" name="id" value={basemap.id} />
							<input type="hidden" name="direction" value="down" />
							<button
								type="submit"
								class="icon-button"
								aria-label={m.basemaps_move_down({ name: basemap.name })}
								disabled={index === basemaps.length - 1}
							>
								<ArrowDownIcon />
							</button>
						</form>
						<button
							type="button"
							class="icon-button"
							aria-label={m.basemaps_edit_named({ name: basemap.name })}
							onclick={() => startEdit(basemap)}
						>
							<PencilIcon />
						</button>
						<button
							type="button"
							class="icon-button danger"
							aria-label={m.basemaps_delete_named({ name: basemap.name })}
							onclick={() => startDelete(basemap)}
						>
							<TrashIcon />
						</button>
					</div>
				</li>
			{/each}
		</ol>
		{#if basemaps.length === 0}
			<p class="empty">{m.basemaps_empty()}</p>
		{/if}
	</section>
</PageShell>
<Dialog bind:open={createOpen} id="basemapCreate" title={m.basemaps_new()}>
	<BasemapForm
		basemap={null}
		serverErrors={errorsFor('create')}
		serverMessage={messageFor('create')}
		onsaved={onCreated}
	/>
</Dialog>
<Dialog bind:open={editOpen} id="basemapEdit" title={m.basemaps_edit_title()}>
	{#key editing?.id}
		<BasemapForm
			basemap={editing}
			serverErrors={errorsFor('update')}
			serverMessage={messageFor('update')}
			onsaved={onUpdated}
		/>
	{/key}
</Dialog>
<ConfirmDialog
	bind:open={deleteOpen}
	id="basemapDelete"
	title={m.basemaps_delete_title()}
	message={m.basemaps_delete_confirm({ name: deleting?.name ?? '' })}
	action="?/delete"
	fields={{ id: deleting?.id ?? '' }}
	confirmLabel={m.common_delete()}
	onresult={deleteResult}
/>

<style lang="scss">
	@use '../../../../styles/colors' as clr;
	@use '../../../../styles/forms' as forms;
	@use '../../../../styles/variables' as vars;

	.section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-width: 48rem;

		> .heading {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			justify-content: space-between;
			gap: 0.8rem 1.2rem;

			> h2 {
				display: flex;
				flex: 1;
				align-items: center;
				gap: 0.9rem;
				font-size: 0.7rem;
				letter-spacing: 0.24em;
				text-transform: uppercase;
				color: clr.$accentColor;

				&::after {
					content: '';
					flex: 1;
					height: 1px;
					background-color: clr.$borderSubtleColor;
				}
			}
		}

		> .lead {
			font-size: 0.86rem;
		}
	}

	.primary {
		@include forms.primaryButton;
	}

	.empty {
		font-size: 0.86rem;
		color: clr.$textMutedColor;
	}

	.list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.card {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		padding: 0.6rem 0.7rem;
		background-color: clr.$surfaceColor;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radius;

		&.in-use {
			border-color: clr.$accentMutedColor;
		}

		> .text {
			display: flex;
			flex: 1;
			flex-direction: column;
			gap: 0.15rem;
			min-width: 0;

			> .name {
				font-size: 0.92rem;
				color: clr.$textPrimaryColor;
			}

			> .url,
			> .note {
				overflow: hidden;
				font-size: 0.72rem;
				color: clr.$textMutedColor;
				text-overflow: ellipsis;
				white-space: nowrap;
			}
		}

		> .actions {
			display: flex;
			flex: none;
			align-items: center;
			gap: 0.3rem;
		}
	}

	.badge {
		display: inline-flex;
		align-items: center;
		min-height: vars.$touchTarget;
		padding: 0 0.7rem;
		font-size: 0.66rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: clr.$accentColor;
	}

	.use {
		@include forms.quietButton;
		min-height: vars.$touchTarget;
	}

	.icon-button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: vars.$touchTarget;
		height: vars.$touchTarget;
		padding: 0;
		color: clr.$textSecondaryColor;
		background-color: transparent;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radius;
		cursor: pointer;
		transition:
			color 160ms ease,
			border-color 160ms ease,
			background-color 160ms ease;

		&:hover:not(:disabled) {
			color: clr.$accentColor;
			border-color: clr.$accentColor;
			background-color: clr.$accentWashColor;
		}

		&.danger:hover:not(:disabled) {
			color: clr.$errorColor;
			border-color: clr.$errorColor;
			background-color: transparent;
		}

		&:disabled {
			opacity: 0.35;
			cursor: not-allowed;
		}
	}

	// Phones put each card's buttons on their own row under the text.
	@media (max-width: vars.$mobileMax) {
		.card {
			flex-wrap: wrap;

			> .text {
				flex-basis: 100%;
			}

			> .actions {
				justify-content: flex-end;
				width: 100%;
				padding-top: 0.5rem;
				border-top: 1px solid clr.$borderMutedColor;
			}
		}
	}
</style>
