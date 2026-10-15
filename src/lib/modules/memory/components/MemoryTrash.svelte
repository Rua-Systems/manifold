<script lang="ts">
	import { enhance } from '$app/forms';
	import ConfirmDialog from '$lib/components/ConfirmDialog/ConfirmDialog.svelte';
	import PageShell from '$lib/components/PageShell/PageShell.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import { getNotifications } from '$lib/state/notifications.svelte';
	import { localizedHref } from '$lib/utils/navigation';
	import { relativeTime } from '$lib/utils/time';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { categoryLabel } from '../categories';
	import type { MemoryCategory, MemorySummary } from '../types';

	interface Props {
		memories: MemorySummary[];
		categories: MemoryCategory[];
		retentionDays: number;
	}

	let { memories, categories, retentionDays }: Props = $props();

	const notifications = getNotifications();

	let deleteOpen = $state(false);
	let deleting = $state<MemorySummary | null>(null);

	function startDelete(item: MemorySummary): void {
		deleting = item;
		deleteOpen = true;
	}

	const notifyResult: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'success' && typeof result.data?.message === 'string') {
				notifications.confirm(result.data.message);
			}
			if (result.type === 'failure' && typeof result.data?.message === 'string') {
				notifications.fault(result.data.message);
			}
			await update();
		};
	};

	const deleteResult: SubmitFunction = (input) => {
		deleteOpen = false;
		return notifyResult(input);
	};
</script>

<PageShell
	title={m.memory_trash_title()}
	sigil={m.memory_sigil()}
	metaDescription={m.memory_trash_meta_description()}
	description={m.memory_trash_description({ days: retentionDays })}
>
	{#snippet actions()}
		<a class="quiet" href={localizedHref('/memory')}>{m.memory_all()}</a>
	{/snippet}
	{#if memories.length === 0}
		<p class="empty">{m.memory_trash_empty()}</p>
	{:else}
		<ol class="list" aria-label={m.memory_trash_title()}>
			{#each memories as item (item.id)}
				<li class="card">
					<div class="text">
						<span class="title">{item.title}</span>
						{#if item.deletedAt}
							<time datetime={item.deletedAt.toISOString()}>
								{m.notes_trashed_at({
									time: relativeTime(item.deletedAt, getLocale())
								})}
								{#if item.categoryId !== null}
									· {categoryLabel(categories, item.categoryId)}
								{/if}
							</time>
						{/if}
					</div>
					<div class="actions">
						<form method="POST" action="?/restore" use:enhance={notifyResult}>
							<input type="hidden" name="id" value={item.id} />
							<button
								type="submit"
								class="secondary"
								aria-label={m.notes_restore_named({ title: item.title })}
							>
								{m.notes_restore()}
							</button>
						</form>
						<button
							type="button"
							class="danger"
							aria-label={m.notes_delete_named({ title: item.title })}
							onclick={() => startDelete(item)}
						>
							{m.notes_delete_forever()}
						</button>
					</div>
				</li>
			{/each}
		</ol>
	{/if}
</PageShell>
<ConfirmDialog
	bind:open={deleteOpen}
	id="memoryDelete"
	title={m.memory_delete_title()}
	message={m.memory_delete_confirm({ title: deleting?.title ?? '' })}
	action="?/delete"
	fields={{ id: deleting?.id ?? '' }}
	confirmLabel={m.notes_delete_forever()}
	onresult={deleteResult}
/>

<style lang="scss">
	@use '../../../../styles/colors' as clr;
	@use '../../../../styles/forms' as forms;
	@use '../../../../styles/variables' as vars;

	.quiet {
		@include forms.mutedLink;
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
		gap: 1rem;
		padding: 0.7rem 0.9rem;
		background-color: clr.$surfaceColor;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radius;

		> .text {
			display: flex;
			flex: 1;
			flex-direction: column;
			gap: 0.2rem;
			min-width: 0;

			> .title {
				overflow: hidden;
				font-size: 0.92rem;
				color: clr.$textPrimaryColor;
				text-overflow: ellipsis;
				white-space: nowrap;
			}

			> time {
				font-size: 0.68rem;
				letter-spacing: 0.08em;
				color: clr.$textMutedColor;
			}
		}

		> .actions {
			display: flex;
			flex: none;
			align-items: center;
			gap: 0.5rem;
		}
	}

	.secondary {
		@include forms.primaryButton;
		padding-inline: 1rem;
	}

	.danger {
		@include forms.quietButton;
		padding-inline: 0.6rem;

		&:hover:not(:disabled) {
			color: clr.$errorColor;
		}
	}

	// Phones stack each memory with its buttons on their own row.
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
