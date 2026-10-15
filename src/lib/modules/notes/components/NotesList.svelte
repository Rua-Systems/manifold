<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import ConfirmDialog from '$lib/components/ConfirmDialog/ConfirmDialog.svelte';
	import Dialog from '$lib/components/Dialog/Dialog.svelte';
	import MoveForm from '$lib/components/Folders/MoveForm.svelte';
	import NameForm from '$lib/components/Folders/NameForm.svelte';
	import PageShell from '$lib/components/PageShell/PageShell.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import { folderNameSchema } from '$lib/schemas/names';
	import { getNotifications } from '$lib/state/notifications.svelte';
	import type { FolderOption } from '$lib/types/folders';
	import type { FieldErrors } from '$lib/types/validation';
	import { actionMessage, postAction } from '$lib/utils/actions';
	import { localizedHref } from '$lib/utils/navigation';
	import { relativeTime } from '$lib/utils/time';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import FolderInputIcon from '@lucide/svelte/icons/folder-input';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import type { SubmitFunction } from '@sveltejs/kit';
	import type { NoteFolderAction, NoteFolderFormState } from '../folders.page.server';
	import type { NoteFolderPath, NoteFolderSummary, NoteSummary } from '../types';

	interface Props {
		notes: NoteSummary[];
		query: string;
		/** The folder shown, null for the top level and for search results. */
		folder: FolderOption | null;
		path: NoteFolderPath;
		/** The folders directly inside the one shown. */
		folders: NoteFolderSummary[];
		/** Every folder, for moving. */
		allFolders: FolderOption[];
		form: NoteFolderFormState | null | undefined;
	}

	let { notes, query, folder, path, folders, allFolders, form }: Props = $props();

	interface DraggedItem {
		kind: 'note' | 'folder';
		id: string;
	}

	interface MoveTarget extends DraggedItem {
		name: string;
		current: string | null;
	}

	const DRAG_TYPE = 'application/x-manifold-note-item';
	const FILTER_DELAY = 300;

	const notifications = getNotifications();

	let filterForm: HTMLFormElement | undefined = $state();
	let timer: ReturnType<typeof setTimeout> | undefined;
	/** The folder something is dragged over, `''` for the top level. */
	let dropTarget = $state<string | null>(null);

	let createOpen = $state(false);
	let renameOpen = $state(false);
	let renaming = $state<NoteFolderSummary | null>(null);
	let moveOpen = $state(false);
	let moving = $state<MoveTarget | null>(null);
	let deleteOpen = $state(false);
	let deleting = $state<NoteFolderSummary | null>(null);

	const searching = $derived(query.length > 0);
	const title = $derived(folder?.name ?? m.notes_title());

	const newNoteHref = $derived.by(() => {
		if (folder === null) {
			return localizedHref('/notes/new');
		}
		return localizedHref(`/notes/new?folder=${folder.id}`);
	});

	function errorsFor(action: NoteFolderAction): FieldErrors {
		if (form?.action !== action || form.success) {
			return {};
		}
		return form.errors;
	}

	function messageFor(action: NoteFolderAction): string {
		if (form?.action !== action || form.success) {
			return '';
		}
		return form.message;
	}

	function filterSoon(): void {
		clearTimeout(timer);
		timer = setTimeout(() => filterForm?.requestSubmit(), FILTER_DELAY);
	}

	function startDrag(event: DragEvent, item: DraggedItem): void {
		if (event.dataTransfer === null) {
			return;
		}
		event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(item));
		event.dataTransfer.effectAllowed = 'move';
	}

	function overFolder(event: DragEvent, target: string): void {
		if (event.dataTransfer?.types.includes(DRAG_TYPE) ?? false) {
			event.preventDefault();
			dropTarget = target;
		}
	}

	async function moveItem(item: DraggedItem, target: string): Promise<void> {
		let action = '?/moveFolder';
		let done = m.notes_folder_moved();
		if (item.kind === 'note') {
			action = '?/moveNote';
			done = m.notes_moved();
		}
		const result = await postAction(action, { id: item.id, target });
		if (result.type === 'success') {
			notifications.confirm(done);
		} else {
			notifications.fault(actionMessage(result, m.folders_error_move_failed()));
		}
		await invalidateAll();
	}

	function dropOnFolder(event: DragEvent, target: string): void {
		dropTarget = null;
		const raw = event.dataTransfer?.getData(DRAG_TYPE) ?? '';
		if (raw === '') {
			return;
		}
		event.preventDefault();
		const item = JSON.parse(raw) as DraggedItem;
		if (item.kind === 'folder' && item.id === target) {
			return;
		}
		void moveItem(item, target);
	}

	function startMove(item: MoveTarget): void {
		moving = item;
		moveOpen = true;
	}

	function closeWith(message: string): void {
		createOpen = false;
		renameOpen = false;
		moveOpen = false;
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

<PageShell {title} sigil={m.notes_sigil()} metaDescription={m.notes_meta_description()}>
	{#snippet actions()}
		<a class="quiet-link" href={localizedHref('/notes/trash')}>{m.notes_trash_title()}</a>
		{#if !searching}
			<button type="button" class="quiet" onclick={() => (createOpen = true)}>
				{m.notes_folder_new()}
			</button>
		{/if}
		<a class="primary" href={newNoteHref}>{m.notes_new()}</a>
	{/snippet}
	<form
		method="GET"
		class="filter"
		role="search"
		data-sveltekit-keepfocus
		data-sveltekit-replacestate
		bind:this={filterForm}
	>
		<label class="visually-hidden" for="notesFilter">{m.notes_filter()}</label>
		<input
			id="notesFilter"
			type="search"
			name="q"
			autocomplete="off"
			placeholder={m.notes_filter()}
			value={query}
			oninput={filterSoon}
		/>
	</form>
	{#if !searching && folder !== null}
		<nav class="path" aria-label={m.notes_folder_path()}>
			<ol>
				<li
					class:target={dropTarget === ''}
					ondragover={(event) => overFolder(event, '')}
					ondragleave={() => (dropTarget = null)}
					ondrop={(event) => dropOnFolder(event, '')}
				>
					<a href={localizedHref('/notes')}>{m.notes_title()}</a>
				</li>
				{#each path as crumb, index (crumb.id)}
					<li
						class:target={dropTarget === crumb.id}
						ondragover={(event) => overFolder(event, crumb.id)}
						ondragleave={() => (dropTarget = null)}
						ondrop={(event) => dropOnFolder(event, crumb.id)}
					>
						<ChevronRightIcon size={14} aria-hidden="true" />
						<a
							href={localizedHref(`/notes?folder=${crumb.id}`)}
							aria-current={index === path.length - 1 ? 'page' : undefined}
						>
							{crumb.name}
						</a>
					</li>
				{/each}
			</ol>
		</nav>
	{/if}
	{#if !searching && folders.length > 0}
		<ul class="folders" aria-label={m.notes_folders()}>
			{#each folders as item (item.id)}
				{@const count = item.noteCount + item.folderCount}
				<li
					class="row"
					class:target={dropTarget === item.id}
					draggable="true"
					ondragstart={(event) => startDrag(event, { kind: 'folder', id: item.id })}
					ondragover={(event) => overFolder(event, item.id)}
					ondragleave={() => (dropTarget = null)}
					ondrop={(event) => dropOnFolder(event, item.id)}
				>
					<a class="main" href={localizedHref(`/notes?folder=${item.id}`)}>
						<span class="box" aria-hidden="true"
							><FolderIcon size={20} strokeWidth={1.5} /></span
						>
						<span class="text">
							<span class="name">{item.name}</span>
							<span class="meta">{m.notes_folder_items({ count })}</span>
						</span>
					</a>
					<div class="actions">
						<button
							type="button"
							class="tool"
							aria-label={m.notes_folder_rename_named({ name: item.name })}
							title={m.notes_folder_rename()}
							onclick={() => {
								renaming = item;
								renameOpen = true;
							}}
						>
							<PencilIcon size={16} />
						</button>
						<button
							type="button"
							class="tool"
							aria-label={m.notes_folder_move_named({ name: item.name })}
							title={m.folders_move()}
							onclick={() =>
								startMove({
									kind: 'folder',
									id: item.id,
									name: item.name,
									current: item.parentId
								})}
						>
							<FolderInputIcon size={16} />
						</button>
						<button
							type="button"
							class="tool danger"
							aria-label={m.notes_folder_delete_named({ name: item.name })}
							title={count > 0 ? m.folders_not_empty_hint() : m.common_delete()}
							disabled={count > 0}
							onclick={() => {
								deleting = item;
								deleteOpen = true;
							}}
						>
							<TrashIcon size={16} />
						</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
	{#if notes.length === 0}
		{#if searching}
			<p class="empty">{m.notes_no_match()}</p>
		{:else if folder !== null && folders.length === 0}
			<p class="empty">{m.notes_folder_empty()}</p>
		{:else if folder === null && folders.length === 0}
			<p class="empty">{m.notes_empty()}</p>
		{/if}
	{:else}
		<ol class="list" aria-label={m.notes_title()}>
			{#each notes as item (item.id)}
				{@const name = item.title || m.notes_untitled()}
				<li
					draggable={searching ? 'false' : 'true'}
					ondragstart={(event) => startDrag(event, { kind: 'note', id: item.id })}
				>
					<a href={localizedHref(`/notes/${item.id}`)}>
						<span class="title">{name}</span>
						{#if item.excerpt}
							<span class="excerpt">{item.excerpt}</span>
						{/if}
						<time datetime={item.updatedAt.toISOString()}>
							{m.notes_updated({ time: relativeTime(item.updatedAt, getLocale()) })}
						</time>
					</a>
					<button
						type="button"
						class="tool move"
						aria-label={m.notes_move_named({ name })}
						title={m.notes_move()}
						onclick={() =>
							startMove({ kind: 'note', id: item.id, name, current: item.folderId })}
					>
						<FolderInputIcon size={16} />
					</button>
				</li>
			{/each}
		</ol>
	{/if}
</PageShell>
<Dialog bind:open={createOpen} id="notesCreateFolder" title={m.notes_folder_new()}>
	<NameForm
		action="?/createFolder"
		fields={{ parent: folder?.id ?? '' }}
		id="notesFolderName"
		label={m.notes_folder_name()}
		initial=""
		schema={folderNameSchema}
		submitLabel={m.notes_folder_create()}
		serverErrors={errorsFor('createFolder')}
		serverMessage={messageFor('createFolder')}
		onsaved={closeWith}
	/>
</Dialog>
<Dialog bind:open={renameOpen} id="notesRenameFolder" title={m.notes_folder_rename()}>
	{#key renaming?.id}
		<NameForm
			action="?/renameFolder"
			fields={{ id: renaming?.id ?? '' }}
			id="notesFolderRename"
			label={m.notes_folder_name()}
			initial={renaming?.name ?? ''}
			schema={folderNameSchema}
			submitLabel={m.common_save()}
			serverErrors={errorsFor('renameFolder')}
			serverMessage={messageFor('renameFolder')}
			onsaved={closeWith}
		/>
	{/key}
</Dialog>
<Dialog
	bind:open={moveOpen}
	id="notesMove"
	title={m.notes_move_title({ name: moving?.name ?? '' })}
>
	{#key moving?.id}
		{#if moving !== null}
			<MoveForm
				action={moving.kind === 'note' ? '?/moveNote' : '?/moveFolder'}
				fields={{ id: moving.id }}
				folders={allFolders}
				rootLabel={m.notes_title()}
				current={moving.current}
				moving={moving.kind === 'folder' ? moving.id : null}
				serverMessage={messageFor(moving.kind === 'note' ? 'moveNote' : 'moveFolder')}
				onsaved={closeWith}
			/>
		{/if}
	{/key}
</Dialog>
<ConfirmDialog
	bind:open={deleteOpen}
	id="notesDeleteFolder"
	title={m.notes_folder_delete_title()}
	message={m.notes_folder_delete_confirm({ name: deleting?.name ?? '' })}
	action="?/deleteFolder"
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
		display: inline-flex;
		align-items: center;
		text-decoration: none;
	}

	.quiet {
		@include forms.framedButton;
	}

	.quiet-link {
		@include forms.mutedLink;
	}

	.filter {
		margin-bottom: 1.2rem;

		> input {
			@include forms.inputSurface;
		}
	}

	.path {
		margin-bottom: 1rem;

		> ol {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: 0.2rem;
			margin: 0;
			padding: 0;
			list-style: none;

			> li {
				display: inline-flex;
				align-items: center;
				gap: 0.2rem;
				font-size: 0.8rem;
				color: clr.$textMutedColor;
				border-radius: vars.$radius;

				&.target {
					outline: 1px dashed clr.$accentColor;
				}

				> a {
					padding: 0.2rem 0.35rem;
					color: clr.$textSecondaryColor;
					text-decoration: none;

					&:hover {
						color: clr.$accentColor;
					}

					&[aria-current='page'] {
						color: clr.$textPrimaryColor;
					}
				}
			}
		}
	}

	.empty {
		font-size: 0.9rem;
		color: clr.$textMutedColor;
	}

	.folders {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin: 0 0 1rem;
		padding: 0;
		list-style: none;
	}

	.row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.45rem 0.6rem;
		background-color: clr.$surfaceColor;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radius;
		transition: border-color 160ms ease;

		&:hover,
		&.target {
			border-color: clr.$accentMutedColor;
		}

		&.target {
			background-color: clr.$accentWashColor;
		}

		> .main {
			display: flex;
			flex: 1;
			align-items: center;
			gap: 0.8rem;
			min-width: 0;
			color: inherit;
			text-decoration: none;

			> .box {
				display: inline-grid;
				flex: none;
				place-items: center;
				width: 2.5rem;
				height: 2.5rem;
				color: clr.$accentColor;
				background-color: clr.$accentWashColor;
				border-radius: vars.$radius;
			}

			> .text {
				display: flex;
				flex-direction: column;
				gap: 0.15rem;
				min-width: 0;

				> .name {
					overflow: hidden;
					font-size: 0.9rem;
					color: clr.$textPrimaryColor;
					text-overflow: ellipsis;
					white-space: nowrap;
				}

				> .meta {
					font-size: 0.72rem;
					color: clr.$textMutedColor;
				}
			}
		}

		> .actions {
			display: flex;
			flex: none;
			gap: 0.25rem;
		}
	}

	.tool {
		@include forms.toolButton;

		&.danger:hover:not(:disabled) {
			color: clr.$errorColor;
		}
	}

	.list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;

		> li {
			position: relative;

			> a {
				display: flex;
				flex-direction: column;
				gap: 0.25rem;
				// Room for the move button in the top right corner.
				padding: 0.8rem 3.4rem 0.8rem 0.9rem;
				text-decoration: none;
				background-color: clr.$surfaceColor;
				border: 1px solid clr.$borderSubtleColor;
				border-radius: vars.$radius;
				transition:
					border-color 160ms ease,
					background-color 160ms ease;

				&:hover {
					border-color: clr.$accentMutedColor;
					background-color: clr.$surfaceHoverColor;
				}

				> .title {
					overflow: hidden;
					font-size: 0.95rem;
					color: clr.$textPrimaryColor;
					text-overflow: ellipsis;
					white-space: nowrap;
				}

				> .excerpt {
					display: -webkit-box;
					overflow: hidden;
					font-size: 0.8rem;
					line-height: 1.55;
					color: clr.$textSecondaryColor;
					-webkit-box-orient: vertical;
					-webkit-line-clamp: 2;
					line-clamp: 2;
				}

				> time {
					font-size: 0.68rem;
					letter-spacing: 0.08em;
					color: clr.$textMutedColor;
				}
			}

			> .move {
				position: absolute;
				top: 0.45rem;
				right: 0.45rem;
			}
		}
	}

	@media (max-width: vars.$mobileMax) {
		.row {
			flex-wrap: wrap;

			> .actions {
				justify-content: flex-end;
				width: 100%;
			}
		}
	}

	@media (pointer: fine) {
		.tool {
			width: 2rem;
			height: 2rem;
		}
	}
</style>
