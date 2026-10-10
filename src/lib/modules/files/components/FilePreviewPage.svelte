<script lang="ts">
	import { resolve } from '$app/paths';
	import ConfirmDialog from '$lib/components/ConfirmDialog/ConfirmDialog.svelte';
	import Dialog from '$lib/components/Dialog/Dialog.svelte';
	import PageShell from '$lib/components/PageShell/PageShell.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import { getNotifications } from '$lib/state/notifications.svelte';
	import type { PathnameWithSearchOrHash } from '$app/types';
	import { formatBytes } from '$lib/utils/format';
	import { localizedHref } from '$lib/utils/navigation';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { kindLabel } from '../labels';
	import { fileNameSchema } from '../schemas';
	import type { FileDetail, FilesAction, FilesFormState, FolderSummary } from '../types';
	import MoveForm from './MoveForm.svelte';
	import ImageEditor from './ImageEditor.svelte';
	import NameForm from './NameForm.svelte';
	import PdfViewer from './PdfViewer.svelte';
	import TextPreview from './TextPreview.svelte';

	interface Props {
		file: FileDetail;
		folders: FolderSummary[];
		/** The Files page address of the place the file lives. */
		back: string;
		form: FilesFormState | null | undefined;
	}

	let { file, folders, back, form }: Props = $props();

	const notifications = getNotifications();
	const locale = $derived(getLocale());

	/** The types the image editor can read and write; SVG and others are not edited. */
	const EDITABLE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

	let editing = $state(false);
	let renameOpen = $state(false);
	let moveOpen = $state(false);
	let deleteOpen = $state(false);

	const source = $derived(resolve('/files/[id]', { id: file.id }));

	const dateFormat = $derived(
		new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })
	);

	function serverMessage(action: FilesAction): string {
		if (form?.action !== action || form.success) {
			return '';
		}
		return form.message;
	}

	function serverErrors(action: FilesAction) {
		if (form?.action !== action || form.success) {
			return {};
		}
		return form.errors;
	}

	function closeWith(message: string): void {
		renameOpen = false;
		moveOpen = false;
		notifications.confirm(message);
	}

	const deleteResult: SubmitFunction = () => {
		deleteOpen = false;
		return async ({ result, update }) => {
			if (result.type === 'failure' && typeof result.data?.message === 'string') {
				notifications.fault(result.data.message);
			}
			if (result.type === 'redirect') {
				notifications.confirm(m.files_deleted());
			}
			await update();
		};
	};
</script>

<PageShell
	title={file.name}
	sigil={m.files_sigil()}
	metaDescription={m.files_view_meta_description()}
>
	{#snippet actions()}
		<a class="primary" href={source} download={file.name} data-sveltekit-reload>
			{m.files_download()}
		</a>
		{#if EDITABLE_TYPES.has(file.mimeType) && !editing}
			<button type="button" class="quiet" onclick={() => (editing = true)}>
				{m.files_edit_image()}
			</button>
		{/if}
		{#if file.inFiles}
			<button type="button" class="quiet" onclick={() => (renameOpen = true)}>
				{m.files_rename()}
			</button>
			<button type="button" class="quiet" onclick={() => (moveOpen = true)}>
				{m.files_move()}
			</button>
		{/if}
		<button
			type="button"
			class="quiet danger"
			disabled={file.uses.length > 0}
			title={file.uses.length > 0 ? m.files_in_use_hint() : undefined}
			onclick={() => (deleteOpen = true)}
		>
			{m.common_delete()}
		</button>
	{/snippet}
	<nav class="path" aria-label={m.files_path()}>
		<ol>
			<li><a href={localizedHref('/files')}>{m.files_title()}</a></li>
			{#if file.location.kind === 'folder'}
				{#each file.location.path as crumb (crumb.id)}
					<li>
						<ChevronRightIcon size={14} aria-hidden="true" />
						<a href={localizedHref(`/files?folder=${crumb.id}`)}>{crumb.name}</a>
					</li>
				{/each}
			{:else}
				<li>
					<ChevronRightIcon size={14} aria-hidden="true" />
					<a href={localizedHref(back as PathnameWithSearchOrHash)}
						>{file.location.label}</a
					>
				</li>
			{/if}
		</ol>
	</nav>
	{#if editing}
		<ImageEditor {file} onclose={() => (editing = false)} />
	{:else}
		<div class="layout">
			<section class="preview" aria-label={m.files_preview()}>
				{#if file.kind === 'image'}
					<img src={source} alt={file.name} />
				{:else if file.kind === 'pdf'}
					<PdfViewer src={source} title={file.name} />
				{:else if file.kind === 'audio'}
					<audio controls preload="metadata" src={source}></audio>
				{:else if file.kind === 'video'}
					<!-- An uploaded video comes without a caption track to point to. -->
					<!-- svelte-ignore a11y_media_has_caption -->
					<video controls preload="metadata" src={source}></video>
				{:else if file.kind === 'text'}
					<TextPreview src={source} mimeType={file.mimeType} sizeBytes={file.sizeBytes} />
				{:else}
					<p class="none">{m.files_no_preview()}</p>
				{/if}
			</section>
			<aside class="details" aria-label={m.files_details()}>
				<dl>
					<div>
						<dt>{m.files_kind()}</dt>
						<dd>{kindLabel(file.kind)} <code>{file.mimeType}</code></dd>
					</div>
					<div>
						<dt>{m.files_size()}</dt>
						<dd>{formatBytes(file.sizeBytes, locale)}</dd>
					</div>
					<div>
						<dt>{m.files_uploaded_at()}</dt>
						<dd>
							<time datetime={file.createdAt.toISOString()}
								>{dateFormat.format(file.createdAt)}</time
							>
						</dd>
					</div>
				</dl>
				<h2>{m.files_uses()}</h2>
				{#if file.uses.length === 0}
					<p class="muted">{m.files_unused_note()}</p>
				{:else}
					<ul class="uses">
						{#each file.uses as use, index (index)}
							<li>
								<a href={localizedHref(use.href as PathnameWithSearchOrHash)}
									>{use.label}</a
								>
								{#if use.trashed}
									<span class="trashed">{m.files_use_trashed()}</span>
								{/if}
							</li>
						{/each}
					</ul>
					<p class="muted">{m.files_in_use_hint()}</p>
				{/if}
			</aside>
		</div>
	{/if}
</PageShell>
{#if file.inFiles}
	<Dialog bind:open={renameOpen} id="fileRename" title={m.files_rename_file()}>
		<NameForm
			action="?/renameFile"
			fields={{ id: file.id }}
			id="fileRenameName"
			label={m.files_file_name()}
			initial={file.name}
			schema={fileNameSchema}
			submitLabel={m.common_save()}
			serverErrors={serverErrors('renameFile')}
			serverMessage={serverMessage('renameFile')}
			onsaved={closeWith}
		/>
	</Dialog>
	<Dialog bind:open={moveOpen} id="fileMove" title={m.files_move_title({ name: file.name })}>
		<MoveForm
			action="?/moveFile"
			fields={{ id: file.id }}
			{folders}
			current={file.folderId}
			moving={null}
			serverMessage={serverMessage('moveFile')}
			onsaved={closeWith}
		/>
	</Dialog>
{/if}
<ConfirmDialog
	bind:open={deleteOpen}
	id="fileDelete"
	title={m.files_delete_file_title()}
	message={m.files_delete_file_confirm({ name: file.name })}
	action="?/deleteFile"
	fields={{ id: file.id }}
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

		&.danger:hover:not(:disabled) {
			color: clr.$errorColor;
			border-color: clr.$errorColor;
		}

		&:disabled {
			opacity: 0.45;
		}
	}

	.path > ol {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.2rem;
		margin: 0 0 1.2rem;
		padding: 0;
		list-style: none;

		> li {
			display: inline-flex;
			align-items: center;
			gap: 0.2rem;
			font-size: 0.8rem;
			color: clr.$textMutedColor;

			> a {
				padding: 0.2rem 0.35rem;
				color: clr.$textSecondaryColor;
				text-decoration: none;

				&:hover {
					color: clr.$accentColor;
				}
			}
		}
	}

	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 17rem;
		align-items: start;
		gap: 1.2rem;
	}

	.preview {
		min-width: 0;

		> img {
			display: block;
			max-width: 100%;
			max-height: 75vh;
			margin-inline: auto;
			border: 1px solid clr.$imageEdgeColor;
			border-radius: vars.$radius;
		}

		> audio {
			width: 100%;
		}

		> video {
			display: block;
			width: 100%;
			max-height: 75vh;
			border-radius: vars.$radius;
		}

		> .none {
			padding: 2rem 1rem;
			font-size: 0.86rem;
			color: clr.$textMutedColor;
			text-align: center;
			background-color: clr.$surfaceColor;
			border: 1px dashed clr.$borderSubtleColor;
			border-radius: vars.$radius;
		}
	}

	.details {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		padding: 0.9rem 1rem;
		background-color: clr.$surfaceColor;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radius;

		> dl {
			display: flex;
			flex-direction: column;
			gap: 0.7rem;
			margin: 0;

			> div {
				display: flex;
				flex-direction: column;
				gap: 0.15rem;

				> dt {
					font-size: 0.64rem;
					letter-spacing: 0.14em;
					text-transform: uppercase;
					color: clr.$textMutedColor;
				}

				> dd {
					margin: 0;
					font-size: 0.84rem;
					color: clr.$textPrimaryColor;
					overflow-wrap: anywhere;

					> code {
						font-size: 0.72rem;
						color: clr.$textSecondaryColor;
					}
				}
			}
		}

		> h2 {
			font-size: 0.64rem;
			letter-spacing: 0.14em;
			text-transform: uppercase;
			color: clr.$accentColor;
		}

		> .muted {
			font-size: 0.76rem;
			color: clr.$textMutedColor;
		}

		> .uses {
			display: flex;
			flex-direction: column;
			gap: 0.3rem;
			margin: 0;
			padding: 0;
			list-style: none;
			font-size: 0.84rem;

			> li {
				display: flex;
				flex-wrap: wrap;
				gap: 0.4rem;

				> a {
					color: clr.$textPrimaryColor;
				}

				> .trashed {
					font-size: 0.68rem;
					color: clr.$errorColor;
				}
			}
		}
	}

	@media (max-width: vars.$mobileMax) {
		.layout {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
