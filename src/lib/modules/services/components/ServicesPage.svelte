<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import ConfirmDialog from '$lib/components/ConfirmDialog/ConfirmDialog.svelte';
	import Dialog from '$lib/components/Dialog/Dialog.svelte';
	import ArrowDownIcon from '$lib/components/icons/ArrowDownIcon.svelte';
	import ArrowUpIcon from '$lib/components/icons/ArrowUpIcon.svelte';
	import GripIcon from '$lib/components/icons/GripIcon.svelte';
	import PencilIcon from '$lib/components/icons/PencilIcon.svelte';
	import TrashIcon from '$lib/components/icons/TrashIcon.svelte';
	import PageShell from '$lib/components/PageShell/PageShell.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { getNotifications } from '$lib/state/notifications.svelte';
	import type { FieldErrors } from '$lib/types/validation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { tick, untrack } from 'svelte';
	import { sortable } from '../sortable';
	import type { ServicesAction, ServicesFormState, ServiceView } from '../types';
	import ServiceForm from './ServiceForm.svelte';
	import ServiceIcon from './ServiceIcon.svelte';

	interface Props {
		services: ServiceView[];
		uploadMaxBytes: number;
		form: ServicesFormState | null | undefined;
	}

	let { services, uploadMaxBytes, form }: Props = $props();

	const notifications = getNotifications();

	let createOpen = $state(false);
	let editOpen = $state(false);
	let deleteOpen = $state(false);
	let editing = $state<ServiceView | null>(null);
	let deleting = $state<ServiceView | null>(null);
	let dragOrder = $state<string[] | null>(null);
	let reorderForm: HTMLFormElement | undefined = $state();

	// `/services?new`, as the command palette's "New service" opens it, starts with the form open.
	$effect(() => {
		if (page.url.searchParams.has('new')) {
			untrack(() => (createOpen = true));
		}
	});

	const ordered: ServiceView[] = $derived.by(() => {
		if (dragOrder === null) {
			return services;
		}
		const byId = new Map(services.map((item) => [item.id, item]));
		return dragOrder.flatMap((id) => byId.get(id) ?? []);
	});

	function errorsFor(action: ServicesAction): FieldErrors {
		if (form?.action !== action || form.success) {
			return {};
		}
		return form.errors;
	}

	function messageFor(action: ServicesAction): string {
		if (form?.action !== action || form.success) {
			return '';
		}
		return form.message;
	}

	function startEdit(item: ServiceView): void {
		editing = item;
		editOpen = true;
	}

	function startDelete(item: ServiceView): void {
		deleting = item;
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

	const reorderResult: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'failure' && typeof result.data?.message === 'string') {
				notifications.fault(result.data.message);
			}
			await update({ reset: false });
			dragOrder = null;
		};
	};

	async function commitOrder(order: string[]): Promise<void> {
		dragOrder = order;
		await tick();
		reorderForm?.requestSubmit();
	}
</script>

<PageShell
	title={m.services_title()}
	sigil={m.services_sigil()}
	metaDescription={m.services_meta_description()}
>
	{#snippet actions()}
		<button type="button" class="primary" onclick={() => (createOpen = true)}>
			{m.services_new()}
		</button>
	{/snippet}
	{#if ordered.length === 0}
		<p class="empty">{m.services_empty()}</p>
	{:else}
		<ol
			class="list"
			aria-label={m.services_title()}
			use:sortable={{
				ids: ordered.map((item) => item.id),
				onpreview: (order) => (dragOrder = order),
				oncommit: commitOrder
			}}
		>
			{#each ordered as item, index (item.id)}
				<li class="card" draggable="true" data-sortable-id={item.id}>
					<span class="grip" title={m.services_drag()} aria-hidden="true">
						<GripIcon />
					</span>
					<ServiceIcon iconSrc={item.iconSrc} initial={item.initial} />
					<div class="text">
						<a href={item.url} target="_blank" rel="external noopener noreferrer">
							{item.alias}
							<span class="visually-hidden">({m.services_new_tab()})</span>
						</a>
						<span class="url">{item.url}</span>
					</div>
					<div class="actions">
						<form method="POST" action="?/move" use:enhance={notifyResult}>
							<input type="hidden" name="id" value={item.id} />
							<input type="hidden" name="direction" value="up" />
							<button
								type="submit"
								class="icon-button"
								aria-label={m.services_move_up({ alias: item.alias })}
								disabled={index === 0}
							>
								<ArrowUpIcon />
							</button>
						</form>
						<form method="POST" action="?/move" use:enhance={notifyResult}>
							<input type="hidden" name="id" value={item.id} />
							<input type="hidden" name="direction" value="down" />
							<button
								type="submit"
								class="icon-button"
								aria-label={m.services_move_down({ alias: item.alias })}
								disabled={index === ordered.length - 1}
							>
								<ArrowDownIcon />
							</button>
						</form>
						<button
							type="button"
							class="icon-button"
							aria-label={m.services_edit_named({ alias: item.alias })}
							onclick={() => startEdit(item)}
						>
							<PencilIcon />
						</button>
						<button
							type="button"
							class="icon-button danger"
							aria-label={m.services_delete_named({ alias: item.alias })}
							onclick={() => startDelete(item)}
						>
							<TrashIcon />
						</button>
					</div>
				</li>
			{/each}
		</ol>
		<form
			method="POST"
			action="?/reorder"
			class="visually-hidden"
			bind:this={reorderForm}
			use:enhance={reorderResult}
		>
			{#each ordered as item (item.id)}
				<input type="hidden" name="id" value={item.id} />
			{/each}
		</form>
	{/if}
</PageShell>
<Dialog bind:open={createOpen} id="serviceCreate" title={m.services_new()}>
	<ServiceForm
		service={null}
		{uploadMaxBytes}
		serverErrors={errorsFor('create')}
		serverMessage={messageFor('create')}
		onsaved={onCreated}
	/>
</Dialog>
<Dialog bind:open={editOpen} id="serviceEdit" title={m.services_edit_title()}>
	{#key editing?.id}
		<ServiceForm
			service={editing}
			{uploadMaxBytes}
			serverErrors={errorsFor('update')}
			serverMessage={messageFor('update')}
			onsaved={onUpdated}
		/>
	{/key}
</Dialog>
<ConfirmDialog
	bind:open={deleteOpen}
	id="serviceDelete"
	title={m.services_delete_title()}
	message={m.services_delete_confirm({ alias: deleting?.alias ?? '' })}
	action="?/delete"
	fields={{ id: deleting?.id ?? '' }}
	confirmLabel={m.common_delete()}
	onresult={deleteResult}
/>

<style lang="scss">
	@use '../../../../styles/colors' as clr;
	@use '../../../../styles/forms' as forms;
	@use '../../../../styles/variables' as vars;

	.primary {
		@include forms.primaryButton;
	}

	.empty {
		font-size: 0.9rem;
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

		> .grip {
			display: flex;
			flex: none;
			color: clr.$textMutedColor;
			cursor: grab;
		}

		> .text {
			display: flex;
			flex: 1;
			flex-direction: column;
			gap: 0.15rem;
			min-width: 0;

			> a {
				overflow: hidden;
				font-size: 0.92rem;
				color: clr.$textPrimaryColor;
				text-decoration: none;
				text-overflow: ellipsis;
				white-space: nowrap;

				&:hover {
					color: clr.$accentColor;
				}
			}

			> .url {
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
			gap: 0.3rem;
		}
	}

	.icon-button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: vars.$touchTarget;
		height: vars.$touchTarget;
		padding: 0;
		color: clr.$textSecondaryColor;
		@include forms.frostedBacking;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radius;
		cursor: pointer;
		transition:
			color 160ms ease,
			border-color 160ms ease;

		&:hover:not(:disabled) {
			color: clr.$accentColor;
			border-color: clr.$accentColor;
			@include forms.tint(clr.$accentWashColor);
		}

		&.danger:hover:not(:disabled) {
			color: clr.$errorColor;
			border-color: clr.$errorColor;
			background-image: none;
		}

		&:disabled {
			opacity: 0.35;
			cursor: not-allowed;
		}
	}

	// Phones stack each service as a card with its buttons on their own row; dragging is a mouse
	// gesture, so the grip goes away and the move buttons do the ordering.
	@media (max-width: vars.$mobileMax) {
		.card {
			flex-wrap: wrap;

			> .grip {
				display: none;
			}

			> .text {
				flex-basis: calc(100% - 4rem);
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
