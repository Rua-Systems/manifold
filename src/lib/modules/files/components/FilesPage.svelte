<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ConfirmDialog from '$lib/components/ConfirmDialog/ConfirmDialog.svelte';
	import Dialog from '$lib/components/Dialog/Dialog.svelte';
	import PageShell from '$lib/components/PageShell/PageShell.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import { getNotifications } from '$lib/state/notifications.svelte';
	import type { FieldErrors } from '$lib/types/validation';
	import { actionMessage, postAction } from '$lib/utils/actions';
	import { formatBytes, formatMegabytes } from '$lib/utils/format';
	import { localizedHref } from '$lib/utils/navigation';
	import { relativeTime } from '$lib/utils/time';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import FilesIcon from '@lucide/svelte/icons/files';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import FolderInputIcon from '@lucide/svelte/icons/folder-input';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import TrashIcon from '@lucide/svelte/icons/trash-2';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { onMount, untrack } from 'svelte';
	import { FILES_LIST_LIMIT } from '../constants';
	import { kindLabel, sourceLabel } from '../labels';
	import { fileNameSchema, folderNameSchema } from '../schemas';
	import { UploadQueue } from '../upload-queue.svelte';
	import type {
		FilesAction,
		FileSummary,
		FilesFilter,
		FilesFormState,
		FilesSort,
		FilesView,
		FolderSummary
	} from '../types';
	import FileGlyph from './FileGlyph.svelte';
	import MoveForm from './MoveForm.svelte';
	import NameForm from './NameForm.svelte';
	import UploadList from './UploadList.svelte';

	interface Props {
		view: FilesView;
		filter: FilesFilter;
		sort: FilesSort;
		folders: FolderSummary[];
		uploadMaxBytes: number;
		form: FilesFormState | null | undefined;
	}

	let { view, filter, sort, folders, uploadMaxBytes, form }: Props = $props();

	interface DraggedItem {
		kind: 'file' | 'folder';
		id: string;
	}

	interface MoveTarget extends DraggedItem {
		name: string;
		current: string | null;
	}

	const DRAG_TYPE = 'application/x-manifold-item';
	const FILTER_DELAY = 300;

	const notifications = getNotifications();
	const locale = $derived(getLocale());

	// The upload form works without JavaScript; once the page runs, picking files starts them.
	let hydrated = $state(false);
	onMount(() => {
		hydrated = true;
	});

	let fileInput: HTMLInputElement | undefined = $state();
	let filterForm: HTMLFormElement | undefined = $state();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let dropping = $state(false);
	/** The folder an item is dragged over, `''` for the top. */
	let dropTarget = $state<string | null>(null);

	let createOpen = $state(false);
	let renameFolderOpen = $state(false);
	let renamingFolder = $state<FolderSummary | null>(null);
	let renameFileOpen = $state(false);
	let renamingFile = $state<FileSummary | null>(null);
	let moveOpen = $state(false);
	let moving = $state<MoveTarget | null>(null);
	let deleteFolderOpen = $state(false);
	let deletingFolder = $state<FolderSummary | null>(null);
	let deleteFileOpen = $state(false);
	let deletingFile = $state<FileSummary | null>(null);

	const queue = new UploadQueue({
		maxBytes: untrack(() => uploadMaxBytes),
		tooLarge: m.validation_file_too_large({
			max: formatMegabytes(untrack(() => uploadMaxBytes))
		}),
		failed: m.files_error_upload_failed(),
		onsettled: () => invalidateAll()
	});

	/** The folder shown, `''` for the top; null when the page shows a source or a filter. */
	const currentFolder = $derived.by(() => {
		if (view.kind !== 'folder') {
			return null;
		}
		return view.folderId ?? '';
	});

	const files = $derived(view.files);

	const filtered = $derived(filter.query !== '' || filter.kind !== 'all' || filter.unused);

	/** The address of the place shown, without the filter, to leave it. */
	const placeHref = $derived.by(() => {
		if (view.kind === 'source') {
			return localizedHref(`/files?source=${encodeURIComponent(view.source.module)}`);
		}
		if (currentFolder !== null && currentFolder !== '') {
			return localizedHref(`/files?folder=${currentFolder}`);
		}
		return localizedHref('/files');
	});

	function errorsFor(action: FilesAction): FieldErrors {
		if (form?.action !== action || form.success) {
			return {};
		}
		return form.errors;
	}

	function messageFor(action: FilesAction): string {
		if (form?.action !== action || form.success) {
			return '';
		}
		return form.message;
	}

	function filterSoon(): void {
		clearTimeout(timer);
		timer = setTimeout(() => filterForm?.requestSubmit(), FILTER_DELAY);
	}

	function upload(list: File[], folder: string): void {
		if (list.length > 0) {
			queue.add(list, '?/upload', { folder });
		}
	}

	function onPick(): void {
		const picked = Array.from(fileInput?.files ?? []);
		if (fileInput !== undefined) {
			fileInput.value = '';
		}
		upload(picked, currentFolder ?? '');
	}

	function carriesFiles(event: DragEvent): boolean {
		return event.dataTransfer?.types.includes('Files') ?? false;
	}

	function onDragOver(event: DragEvent): void {
		if (currentFolder !== null && carriesFiles(event)) {
			event.preventDefault();
			dropping = true;
		}
	}

	function onDrop(event: DragEvent): void {
		dropping = false;
		if (currentFolder === null || !carriesFiles(event)) {
			return;
		}
		event.preventDefault();
		upload(Array.from(event.dataTransfer?.files ?? []), currentFolder);
	}

	function startDrag(event: DragEvent, item: DraggedItem): void {
		if (event.dataTransfer === null) {
			return;
		}
		event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(item));
		event.dataTransfer.effectAllowed = 'move';
	}

	function overFolder(event: DragEvent, target: string): void {
		const types = event.dataTransfer?.types ?? [];
		if (types.includes(DRAG_TYPE) || types.includes('Files')) {
			event.preventDefault();
			event.stopPropagation();
			dropTarget = target;
		}
	}

	async function moveItem(item: DraggedItem, target: string): Promise<void> {
		let action = '?/moveFolder';
		if (item.kind === 'file') {
			action = '?/moveFile';
		}
		const result = await postAction(action, { id: item.id, target });
		if (result.type === 'success') {
			notifications.confirm(m.files_moved());
		} else {
			notifications.fault(actionMessage(result, m.files_error_move_failed()));
		}
		await invalidateAll();
	}

	/** A file from the computer is uploaded into the folder; an item of the page moves there. */
	function dropOnFolder(event: DragEvent, target: string): void {
		dropTarget = null;
		dropping = false;
		event.preventDefault();
		event.stopPropagation();
		if (carriesFiles(event)) {
			upload(Array.from(event.dataTransfer?.files ?? []), target);
			return;
		}
		const raw = event.dataTransfer?.getData(DRAG_TYPE) ?? '';
		if (raw === '') {
			return;
		}
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
		renameFolderOpen = false;
		renameFileOpen = false;
		moveOpen = false;
		notifications.confirm(message);
	}

	const deleteResult: SubmitFunction = () => {
		deleteFolderOpen = false;
		deleteFileOpen = false;
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

{#snippet fileMeta(file: FileSummary)}
	<span class="meta">
		{kindLabel(file.kind)} · {formatBytes(file.sizeBytes, locale)} ·
		<time datetime={file.createdAt.toISOString()}>{relativeTime(file.createdAt, locale)}</time>
		{#if !file.inFiles}
			· {sourceLabel(file.ownerModule)}
		{/if}
	</span>
	{#if file.uses.length > 0}
		<span class="uses">{m.files_used_in({ count: file.uses.length })}</span>
	{/if}
{/snippet}

<PageShell
	title={m.files_title()}
	sigil={m.files_sigil()}
	metaDescription={m.files_meta_description()}
>
	{#snippet actions()}
		{#if currentFolder !== null}
			<button type="button" class="quiet" onclick={() => (createOpen = true)}>
				{m.files_new_folder()}
			</button>
			<form
				method="POST"
				action="?/upload"
				enctype="multipart/form-data"
				class="upload-form"
				use:enhance={({ cancel }) => cancel()}
			>
				<input type="hidden" name="folder" value={currentFolder} />
				<label class="primary">
					{m.files_upload()}
					<input
						bind:this={fileInput}
						type="file"
						name="file"
						multiple
						class="visually-hidden"
						onchange={() => {
							if (hydrated) {
								onPick();
							}
						}}
					/>
				</label>
				{#if !hydrated}
					<button type="submit" class="quiet">{m.files_upload_send()}</button>
				{/if}
			</form>
		{/if}
	{/snippet}
	<form
		method="GET"
		class="filters"
		role="search"
		data-sveltekit-keepfocus
		data-sveltekit-replacestate
		bind:this={filterForm}
	>
		{#if view.kind === 'source'}
			<input type="hidden" name="source" value={view.source.module} />
		{:else if currentFolder !== null && currentFolder !== ''}
			<input type="hidden" name="folder" value={currentFolder} />
		{/if}
		<label class="visually-hidden" for="filesFilter">{m.files_filter()}</label>
		<input
			id="filesFilter"
			class="query"
			type="search"
			name="q"
			autocomplete="off"
			placeholder={m.files_filter()}
			value={filter.query}
			oninput={filterSoon}
		/>
		<label class="select">
			<span class="visually-hidden">{m.files_kind()}</span>
			<select name="kind" value={filter.kind} onchange={() => filterForm?.requestSubmit()}>
				<option value="all">{m.files_kind_all()}</option>
				<option value="image">{m.files_kind_image()}</option>
				<option value="pdf">{m.files_kind_pdf()}</option>
				<option value="audio">{m.files_kind_audio()}</option>
				<option value="video">{m.files_kind_video()}</option>
				<option value="text">{m.files_kind_text()}</option>
				<option value="other">{m.files_kind_other()}</option>
			</select>
		</label>
		<label class="select">
			<span class="visually-hidden">{m.files_sort()}</span>
			<select name="sort" value={sort} onchange={() => filterForm?.requestSubmit()}>
				<option value="newest">{m.files_sort_newest()}</option>
				<option value="oldest">{m.files_sort_oldest()}</option>
				<option value="name">{m.files_sort_name()}</option>
				<option value="size">{m.files_sort_size()}</option>
			</select>
		</label>
		<label class="check">
			<input
				type="checkbox"
				name="unused"
				value="1"
				checked={filter.unused}
				onchange={() => filterForm?.requestSubmit()}
			/>
			<span>{m.files_unused()}</span>
		</label>
		{#if !hydrated}
			<button type="submit" class="quiet">{m.files_apply()}</button>
		{/if}
	</form>
	<nav class="path" aria-label={m.files_path()}>
		<ol>
			<li
				class:target={dropTarget === ''}
				ondragover={(event) => overFolder(event, '')}
				ondragleave={() => (dropTarget = null)}
				ondrop={(event) => dropOnFolder(event, '')}
			>
				<a href={localizedHref('/files')}>{m.files_title()}</a>
			</li>
			{#if view.kind === 'folder'}
				{#each view.path as crumb, index (crumb.id)}
					<li
						class:target={dropTarget === crumb.id}
						ondragover={(event) => overFolder(event, crumb.id)}
						ondragleave={() => (dropTarget = null)}
						ondrop={(event) => dropOnFolder(event, crumb.id)}
					>
						<ChevronRightIcon size={14} aria-hidden="true" />
						<a
							href={localizedHref(`/files?folder=${crumb.id}`)}
							aria-current={index === view.path.length - 1 ? 'page' : undefined}
						>
							{crumb.name}
						</a>
					</li>
				{/each}
			{:else if view.kind === 'source'}
				<li>
					<ChevronRightIcon size={14} aria-hidden="true" />
					<a href={placeHref} aria-current="page">{view.source.label}</a>
				</li>
			{:else}
				<li>
					<ChevronRightIcon size={14} aria-hidden="true" />
					<span>{m.files_results()}</span>
				</li>
			{/if}
		</ol>
		{#if filtered}
			<a class="clear" href={placeHref}>{m.files_clear_filter()}</a>
		{/if}
	</nav>
	{#if form?.action === 'upload' && !hydrated}
		<div class="upload-result" role="status">
			<p>{form.message}</p>
			{#each form.rejected ?? [] as item (item.name)}
				<p class="refused">{item.name}: {item.message}</p>
			{/each}
		</div>
	{/if}
	<UploadList {queue} />
	<section
		class="browser"
		class:dropping
		aria-label={m.files_contents()}
		ondragover={onDragOver}
		ondragleave={() => (dropping = false)}
		ondrop={onDrop}
	>
		{#if view.kind === 'folder' && view.sources.length + view.folders.length + files.length === 0}
			<p class="empty">{m.files_empty_folder()}</p>
		{:else if view.kind !== 'folder' && files.length === 0}
			<p class="empty">{filtered ? m.files_no_match() : m.files_empty_source()}</p>
		{:else}
			<ul class="items">
				{#if view.kind === 'folder'}
					{#each view.sources as source (source.module)}
						<li class="row">
							<a
								class="main"
								href={localizedHref(
									`/files?source=${encodeURIComponent(source.module)}`
								)}
							>
								<span class="box source" aria-hidden="true"
									><FilesIcon size={20} strokeWidth={1.5} /></span
								>
								<span class="text">
									<span class="name">{source.label}</span>
									<span class="meta"
										>{m.files_source_files({ count: source.fileCount })}</span
									>
								</span>
							</a>
						</li>
					{/each}
					{#each view.folders as folder (folder.id)}
						<li
							class="row"
							class:target={dropTarget === folder.id}
							draggable="true"
							ondragstart={(event) =>
								startDrag(event, { kind: 'folder', id: folder.id })}
							ondragover={(event) => overFolder(event, folder.id)}
							ondragleave={() => (dropTarget = null)}
							ondrop={(event) => dropOnFolder(event, folder.id)}
						>
							<a class="main" href={localizedHref(`/files?folder=${folder.id}`)}>
								<span class="box" aria-hidden="true"
									><FolderIcon size={20} strokeWidth={1.5} /></span
								>
								<span class="text">
									<span class="name">{folder.name}</span>
									<span class="meta"
										>{m.files_items({ count: folder.itemCount })}</span
									>
								</span>
							</a>
							<div class="actions">
								<button
									type="button"
									class="tool"
									aria-label={m.files_rename_named({ name: folder.name })}
									title={m.files_rename()}
									onclick={() => {
										renamingFolder = folder;
										renameFolderOpen = true;
									}}
								>
									<PencilIcon size={16} />
								</button>
								<button
									type="button"
									class="tool"
									aria-label={m.files_move_named({ name: folder.name })}
									title={m.files_move()}
									onclick={() =>
										startMove({
											kind: 'folder',
											id: folder.id,
											name: folder.name,
											current: folder.parentId
										})}
								>
									<FolderInputIcon size={16} />
								</button>
								<button
									type="button"
									class="tool danger"
									aria-label={m.files_delete_named({ name: folder.name })}
									title={folder.itemCount > 0
										? m.files_folder_not_empty_hint()
										: m.common_delete()}
									disabled={folder.itemCount > 0}
									onclick={() => {
										deletingFolder = folder;
										deleteFolderOpen = true;
									}}
								>
									<TrashIcon size={16} />
								</button>
							</div>
						</li>
					{/each}
				{/if}
				{#each files as file (file.id)}
					<li
						class="row"
						draggable={file.inFiles ? 'true' : 'false'}
						ondragstart={(event) => {
							if (file.inFiles) {
								startDrag(event, { kind: 'file', id: file.id });
							}
						}}
					>
						<a class="main" href={localizedHref(`/files/view/${file.id}`)}>
							<FileGlyph id={file.id} kind={file.kind} />
							<span class="text">
								<span class="name">{file.name}</span>
								{@render fileMeta(file)}
							</span>
						</a>
						<div class="actions">
							<a
								class="tool"
								href={resolve('/files/[id]', { id: file.id })}
								download={file.name}
								aria-label={m.files_download_named({ name: file.name })}
								title={m.files_download()}
								data-sveltekit-reload
							>
								<DownloadIcon size={16} />
							</a>
							{#if file.inFiles}
								<button
									type="button"
									class="tool"
									aria-label={m.files_rename_named({ name: file.name })}
									title={m.files_rename()}
									onclick={() => {
										renamingFile = file;
										renameFileOpen = true;
									}}
								>
									<PencilIcon size={16} />
								</button>
								<button
									type="button"
									class="tool"
									aria-label={m.files_move_named({ name: file.name })}
									title={m.files_move()}
									onclick={() =>
										startMove({
											kind: 'file',
											id: file.id,
											name: file.name,
											current: file.folderId
										})}
								>
									<FolderInputIcon size={16} />
								</button>
							{/if}
							<button
								type="button"
								class="tool danger"
								aria-label={m.files_delete_named({ name: file.name })}
								title={file.uses.length > 0
									? m.files_in_use_hint()
									: m.common_delete()}
								disabled={file.uses.length > 0}
								onclick={() => {
									deletingFile = file;
									deleteFileOpen = true;
								}}
							>
								<TrashIcon size={16} />
							</button>
						</div>
					</li>
				{/each}
			</ul>
			{#if files.length >= FILES_LIST_LIMIT}
				<p class="limit">{m.files_list_limit({ count: FILES_LIST_LIMIT })}</p>
			{/if}
		{/if}
	</section>
</PageShell>
<Dialog bind:open={createOpen} id="filesCreateFolder" title={m.files_new_folder()}>
	<NameForm
		action="?/createFolder"
		fields={{ parent: currentFolder ?? '' }}
		id="filesFolderName"
		label={m.files_folder_name()}
		initial=""
		schema={folderNameSchema}
		submitLabel={m.files_create()}
		serverErrors={errorsFor('createFolder')}
		serverMessage={messageFor('createFolder')}
		onsaved={closeWith}
	/>
</Dialog>
<Dialog bind:open={renameFolderOpen} id="filesRenameFolder" title={m.files_rename_folder()}>
	{#key renamingFolder?.id}
		<NameForm
			action="?/renameFolder"
			fields={{ id: renamingFolder?.id ?? '' }}
			id="filesFolderRename"
			label={m.files_folder_name()}
			initial={renamingFolder?.name ?? ''}
			schema={folderNameSchema}
			submitLabel={m.common_save()}
			serverErrors={errorsFor('renameFolder')}
			serverMessage={messageFor('renameFolder')}
			onsaved={closeWith}
		/>
	{/key}
</Dialog>
<Dialog bind:open={renameFileOpen} id="filesRenameFile" title={m.files_rename_file()}>
	{#key renamingFile?.id}
		<NameForm
			action="?/renameFile"
			fields={{ id: renamingFile?.id ?? '' }}
			id="filesFileRename"
			label={m.files_file_name()}
			initial={renamingFile?.name ?? ''}
			schema={fileNameSchema}
			submitLabel={m.common_save()}
			serverErrors={errorsFor('renameFile')}
			serverMessage={messageFor('renameFile')}
			onsaved={closeWith}
		/>
	{/key}
</Dialog>
<Dialog
	bind:open={moveOpen}
	id="filesMove"
	title={m.files_move_title({ name: moving?.name ?? '' })}
>
	{#key moving?.id}
		{#if moving !== null}
			<MoveForm
				action={moving.kind === 'file' ? '?/moveFile' : '?/moveFolder'}
				fields={{ id: moving.id }}
				{folders}
				current={moving.current}
				moving={moving.kind === 'folder' ? moving.id : null}
				serverMessage={messageFor(moving.kind === 'file' ? 'moveFile' : 'moveFolder')}
				onsaved={closeWith}
			/>
		{/if}
	{/key}
</Dialog>
<ConfirmDialog
	bind:open={deleteFolderOpen}
	id="filesDeleteFolder"
	title={m.files_delete_folder_title()}
	message={m.files_delete_folder_confirm({ name: deletingFolder?.name ?? '' })}
	action="?/deleteFolder"
	fields={{ id: deletingFolder?.id ?? '' }}
	confirmLabel={m.common_delete()}
	onresult={deleteResult}
/>
<ConfirmDialog
	bind:open={deleteFileOpen}
	id="filesDeleteFile"
	title={m.files_delete_file_title()}
	message={m.files_delete_file_confirm({ name: deletingFile?.name ?? '' })}
	action="?/deleteFile"
	fields={{ id: deletingFile?.id ?? '' }}
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
	}

	.quiet {
		@include forms.framedButton;
	}

	.upload-form {
		display: flex;
		align-items: center;
		gap: 0.7rem;
	}

	.filters {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 1rem;

		> .query {
			@include forms.inputSurface;
			flex: 1 1 16rem;
		}

		> .select > select {
			@include forms.inputSurface;
			width: auto;
			padding-right: 2rem;
		}

		> .check {
			display: inline-flex;
			align-items: center;
			gap: 0.5rem;
			min-height: vars.$touchTarget;
			font-size: 0.78rem;
			color: clr.$textSecondaryColor;
			cursor: pointer;

			> input {
				width: 1rem;
				height: 1rem;
				accent-color: clr.$accentColor;
			}
		}
	}

	.path {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem 1rem;
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

		> .clear {
			@include forms.mutedLink;
		}
	}

	.upload-result {
		margin-bottom: 1rem;
		font-size: 0.82rem;
		color: clr.$textSecondaryColor;

		> .refused {
			color: clr.$errorColor;
		}
	}

	.browser {
		min-height: 12rem;
		padding: 0.4rem;
		border: 1px dashed transparent;
		border-radius: vars.$radiusLarge;
		transition: border-color 160ms ease;

		&.dropping {
			border-color: clr.$accentColor;
			background-color: clr.$accentWashColor;
		}
	}

	.empty,
	.limit {
		padding: 1rem 0.4rem;
		font-size: 0.86rem;
		color: clr.$textMutedColor;
	}

	.items {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin: 0;
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

				&.source {
					color: clr.$textSecondaryColor;
					background-color: clr.$surfaceHoverColor;
				}
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

				> :global(.meta) {
					font-size: 0.72rem;
					color: clr.$textMutedColor;
				}

				> :global(.uses) {
					font-size: 0.68rem;
					letter-spacing: 0.08em;
					text-transform: uppercase;
					color: clr.$accentColor;
				}
			}
		}

		> .actions {
			display: flex;
			flex: none;
			gap: 0.25rem;

			> .tool {
				@include forms.toolButton;

				&.danger:hover:not(:disabled) {
					color: clr.$errorColor;
				}
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
		.row > .actions > .tool {
			width: 2rem;
			height: 2rem;
		}
	}
</style>
