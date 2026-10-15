<script lang="ts">
	import ConfirmDialog from '$lib/components/ConfirmDialog/ConfirmDialog.svelte';
	import Dialog from '$lib/components/Dialog/Dialog.svelte';
	import PencilIcon from '$lib/components/icons/PencilIcon.svelte';
	import TrashIcon from '$lib/components/icons/TrashIcon.svelte';
	import PageShell from '$lib/components/PageShell/PageShell.svelte';
	import SettingsNav from '$lib/components/SettingsNav/SettingsNav.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { getNotifications } from '$lib/state/notifications.svelte';
	import type { Tag, TagsAction, TagsFormState } from '$lib/types/tags';
	import type { FieldErrors } from '$lib/types/validation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import TagChip from './TagChip.svelte';
	import TagForm from './TagForm.svelte';

	interface Props {
		tags: Tag[];
		form: TagsFormState | null | undefined;
	}

	let { tags, form }: Props = $props();

	const notifications = getNotifications();

	let createOpen = $state(false);
	let editOpen = $state(false);
	let deleteOpen = $state(false);
	let editing = $state<Tag | null>(null);
	let deleting = $state<Tag | null>(null);

	function errorsFor(action: TagsAction): FieldErrors {
		if (form?.action !== action || form.success) {
			return {};
		}
		return form.errors;
	}

	function messageFor(action: TagsAction): string {
		if (form?.action !== action || form.success) {
			return '';
		}
		return form.message;
	}

	function startEdit(tag: Tag): void {
		editing = tag;
		editOpen = true;
	}

	function startDelete(tag: Tag): void {
		deleting = tag;
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

	const deleteResult: SubmitFunction = () => {
		deleteOpen = false;
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
</script>

<PageShell
	title={m.tags_title()}
	sigil={m.account_sigil()}
	metaDescription={m.tags_meta_description()}
>
	<SettingsNav />
	<section class="section" aria-labelledby="tagsHeading">
		<div class="heading">
			<h2 id="tagsHeading">{m.tags_heading()}</h2>
			<button type="button" class="primary" onclick={() => (createOpen = true)}>
				{m.tags_new()}
			</button>
		</div>
		<p class="lead">{m.tags_lead()}</p>
		{#if tags.length === 0}
			<p class="empty">{m.tags_empty()}</p>
		{:else}
			<ul class="list" aria-label={m.tags_heading()}>
				{#each tags as tag (tag.id)}
					<li class="card">
						<span class="name"><TagChip name={tag.name} color={tag.color} /></span>
						<div class="actions">
							<button
								type="button"
								class="icon-button"
								aria-label={m.tags_edit_named({ name: tag.name })}
								onclick={() => startEdit(tag)}
							>
								<PencilIcon />
							</button>
							<button
								type="button"
								class="icon-button danger"
								aria-label={m.tags_delete_named({ name: tag.name })}
								onclick={() => startDelete(tag)}
							>
								<TrashIcon />
							</button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</PageShell>
<Dialog bind:open={createOpen} id="tagCreate" title={m.tags_new()}>
	{#key createOpen}
		<TagForm
			tag={null}
			serverErrors={errorsFor('create')}
			serverMessage={messageFor('create')}
			onsaved={onCreated}
		/>
	{/key}
</Dialog>
<Dialog bind:open={editOpen} id="tagEdit" title={m.tags_edit_title()}>
	{#key editing?.id}
		<TagForm
			tag={editing}
			serverErrors={errorsFor('update')}
			serverMessage={messageFor('update')}
			onsaved={onUpdated}
		/>
	{/key}
</Dialog>
<ConfirmDialog
	bind:open={deleteOpen}
	id="tagDelete"
	title={m.tags_delete_title()}
	message={m.tags_delete_confirm({ name: deleting?.name ?? '' })}
	action="?/delete"
	fields={{ id: deleting?.id ?? '' }}
	confirmLabel={m.common_delete()}
	onresult={deleteResult}
/>

<style lang="scss">
	@use '../../../styles/colors' as clr;
	@use '../../../styles/forms' as forms;
	@use '../../../styles/variables' as vars;

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
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.card {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.4rem 0.4rem 0.4rem 0.7rem;
		background-color: clr.$surfaceColor;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radius;

		> .name {
			display: flex;
			flex: 1;
			min-width: 0;
		}

		> .actions {
			display: flex;
			flex: none;
			align-items: center;
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

		&:hover {
			color: clr.$accentColor;
			border-color: clr.$accentColor;
			@include forms.tint(clr.$accentWashColor);
		}

		&.danger:hover {
			color: clr.$errorColor;
			border-color: clr.$errorColor;
			background-image: none;
		}
	}
</style>
