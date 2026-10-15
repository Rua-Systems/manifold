<script lang="ts">
	import { enhance } from '$app/forms';
	import ConfirmDialog from '$lib/components/ConfirmDialog/ConfirmDialog.svelte';
	import Dialog from '$lib/components/Dialog/Dialog.svelte';
	import PencilIcon from '$lib/components/icons/PencilIcon.svelte';
	import TrashIcon from '$lib/components/icons/TrashIcon.svelte';
	import PageShell from '$lib/components/PageShell/PageShell.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { getNotifications } from '$lib/state/notifications.svelte';
	import { localizedHref } from '$lib/utils/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { MEMORY_CATEGORY_NAME_MAX_LENGTH } from '../schemas';
	import type { MemoryCategoriesFormState, MemoryCategory, MemoryCategoryNode } from '../types';

	interface Props {
		tree: MemoryCategoryNode[];
		form: MemoryCategoriesFormState | null | undefined;
	}

	let { tree, form }: Props = $props();

	const notifications = getNotifications();

	let createOpen = $state(false);
	let renameOpen = $state(false);
	let deleteOpen = $state(false);
	/** The category a new subcategory goes into, or null for a new category. */
	let parent = $state<MemoryCategory | null>(null);
	let renaming = $state<MemoryCategory | null>(null);
	let deleting = $state<MemoryCategory | null>(null);

	function errorFor(action: 'create' | 'rename', name: string): string {
		if (form?.action !== action || form.success) {
			return '';
		}
		return form.errors[name] ?? '';
	}

	function startCreate(into: MemoryCategory | null): void {
		parent = into;
		createOpen = true;
	}

	function startRename(category: MemoryCategory): void {
		renaming = category;
		renameOpen = true;
	}

	function startDelete(category: MemoryCategory): void {
		deleting = category;
		deleteOpen = true;
	}

	function closing(close: () => void): SubmitFunction {
		return () => {
			return async ({ result, update }) => {
				if (result.type === 'success' && typeof result.data?.message === 'string') {
					close();
					notifications.confirm(result.data.message);
				}
				if (
					result.type === 'failure' &&
					typeof result.data?.message === 'string' &&
					result.data.message !== ''
				) {
					notifications.fault(result.data.message);
				}
				await update({ reset: false });
			};
		};
	}

	const created = closing(() => (createOpen = false));
	const renamed = closing(() => (renameOpen = false));

	const deleteResult: SubmitFunction = (input) => {
		deleteOpen = false;
		return closing(() => {})(input);
	};
</script>

{#snippet actionsOf(category: MemoryCategory)}
	<div class="actions">
		<button
			type="button"
			class="icon-button"
			aria-label={m.memory_categories_rename_named({ name: category.name })}
			onclick={() => startRename(category)}
		>
			<PencilIcon />
		</button>
		<button
			type="button"
			class="icon-button danger"
			aria-label={m.memory_categories_delete_named({ name: category.name })}
			onclick={() => startDelete(category)}
		>
			<TrashIcon />
		</button>
	</div>
{/snippet}

<PageShell
	title={m.memory_categories_title()}
	sigil={m.memory_sigil()}
	metaDescription={m.memory_categories_meta_description()}
	description={m.memory_categories_description()}
>
	{#snippet actions()}
		<a class="quiet" href={localizedHref('/memory')}>{m.memory_all()}</a>
		<button type="button" class="primary" onclick={() => startCreate(null)}>
			{m.memory_categories_new()}
		</button>
	{/snippet}
	{#if tree.length === 0}
		<p class="empty">{m.memory_categories_empty()}</p>
	{:else}
		<ul class="tree" aria-label={m.memory_categories_title()}>
			{#each tree as node (node.id)}
				<li>
					<div class="row">
						<a class="name" href={localizedHref(`/memory?category=${node.id}`)}>
							{node.name}
						</a>
						<span class="count">{m.memory_categories_count({ count: node.count })}</span
						>
						<button
							type="button"
							class="add"
							aria-label={m.memory_categories_new_sub_named({ name: node.name })}
							onclick={() => startCreate(node)}
						>
							{m.memory_categories_new_sub()}
						</button>
						{@render actionsOf(node)}
					</div>
					{#if node.children.length > 0}
						<ul class="children">
							{#each node.children as child (child.id)}
								<li class="row">
									<a
										class="name"
										href={localizedHref(`/memory?category=${child.id}`)}
									>
										{child.name}
									</a>
									<span class="count">
										{m.memory_categories_count({ count: child.count })}
									</span>
									{@render actionsOf(child)}
								</li>
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</PageShell>
<Dialog
	bind:open={createOpen}
	id="categoryCreate"
	title={parent === null
		? m.memory_categories_new()
		: m.memory_categories_new_sub_in({ name: parent.name })}
>
	{#key createOpen}
		<form method="POST" action="?/create" use:enhance={created} novalidate>
			<input type="hidden" name="parent" value={parent?.id ?? ''} />
			<div class="field">
				<label for="categoryName">{m.field_category_name()}</label>
				<input
					id="categoryName"
					name="name"
					type="text"
					autocomplete="off"
					maxlength={MEMORY_CATEGORY_NAME_MAX_LENGTH}
					aria-invalid={errorFor('create', 'name').length > 0}
					aria-describedby="categoryNameError"
				/>
				<p class="error" id="categoryNameError">
					{errorFor('create', 'name') || errorFor('create', 'parent')}
				</p>
			</div>
			<div class="submit">
				<button type="submit" class="primary">{m.memory_categories_add()}</button>
			</div>
		</form>
	{/key}
</Dialog>
<Dialog bind:open={renameOpen} id="categoryRename" title={m.memory_categories_rename_title()}>
	{#key renaming?.id}
		<form method="POST" action="?/rename" use:enhance={renamed} novalidate>
			<input type="hidden" name="id" value={renaming?.id ?? ''} />
			<div class="field">
				<label for="categoryRenameName">{m.field_category_name()}</label>
				<input
					id="categoryRenameName"
					name="name"
					type="text"
					autocomplete="off"
					maxlength={MEMORY_CATEGORY_NAME_MAX_LENGTH}
					value={renaming?.name ?? ''}
					aria-invalid={errorFor('rename', 'name').length > 0}
					aria-describedby="categoryRenameError"
				/>
				<p class="error" id="categoryRenameError">{errorFor('rename', 'name')}</p>
			</div>
			<div class="submit">
				<button type="submit" class="primary">{m.common_save()}</button>
			</div>
		</form>
	{/key}
</Dialog>
<ConfirmDialog
	bind:open={deleteOpen}
	id="categoryDelete"
	title={m.memory_categories_delete_title()}
	message={m.memory_categories_delete_confirm({ name: deleting?.name ?? '' })}
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

	.quiet {
		@include forms.framedButton;
		display: inline-flex;
		align-items: center;
		text-decoration: none;
	}

	.empty {
		font-size: 0.9rem;
		color: clr.$textMutedColor;
	}

	.tree {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-width: 48rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.children {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		margin: 0.3rem 0 0 1.4rem;
		padding: 0 0 0 0.8rem;
		list-style: none;
		border-left: 1px solid clr.$borderSubtleColor;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.4rem 0.4rem 0.4rem 0.8rem;
		background-color: clr.$surfaceColor;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radius;

		> .name {
			flex: 1;
			min-width: 0;
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

		> .count {
			flex: none;
			font-size: 0.7rem;
			color: clr.$textMutedColor;
		}

		> .add {
			@include forms.quietButton;
			flex: none;
			padding-inline: 0.6rem;
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
		display: flex;
		justify-content: flex-end;
	}

	// Phones put the buttons of a category on their own row under its name.
	@media (max-width: vars.$mobileMax) {
		.row {
			flex-wrap: wrap;

			> .name {
				flex-basis: 60%;
			}
		}
	}
</style>
