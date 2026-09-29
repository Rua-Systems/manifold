<script lang="ts">
	import { deserialize, enhance } from '$app/forms';
	import { beforeNavigate, invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import Dialog from '$lib/components/Dialog/Dialog.svelte';
	import TrashIcon from '$lib/components/icons/TrashIcon.svelte';
	import { SIDEBAR_DEPENDENCY } from '$lib/modules/registry';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import { getNotifications } from '$lib/state/notifications.svelte';
	import { formatMegabytes } from '$lib/utils/format';
	import { localizedHref } from '$lib/utils/navigation';
	import { relativeTime } from '$lib/utils/time';
	import { pageTitle } from '$lib/utils/title';
	import History from '@lucide/svelte/icons/history';
	import type { ActionResult, SubmitFunction } from '@sveltejs/kit';
	import { untrack } from 'svelte';
	import { emptyNoteContent, type NoteContent } from '../content';
	import {
		NoteDraft,
		type SaveRequest,
		type SaveResponse,
		type SaveStatus
	} from '../draft.svelte';
	import { NEW_NOTE_ID, NOTE_DEPENDENCY } from '../paths';
	import type { NoteDetail, NoteRevisionSummary } from '../types';
	import NoteEditor from './NoteEditor.svelte';

	interface Props {
		/** Null for a note that is not saved yet. */
		note: NoteDetail | null;
		revisions: NoteRevisionSummary[];
		/** A revision shown read-only instead of the editor. */
		preview: { version: number; title: string; content: NoteContent } | null;
		uploadMaxBytes: number;
		/** Called once the first save has created the note. */
		oncreated?: (id: string) => Promise<void>;
	}

	let { note, revisions, preview, uploadMaxBytes, oncreated }: Props = $props();

	const STATUSES: SaveStatus[] = ['idle', 'saved', 'unsaved', 'saving', 'failed', 'conflict'];

	const STATUS_LABELS: Record<SaveStatus, () => string> = {
		idle: () => '',
		saved: m.notes_status_saved,
		unsaved: m.notes_status_unsaved,
		saving: m.notes_status_saving,
		failed: m.notes_status_failed,
		conflict: m.notes_status_conflict
	};

	const ACTOR_LABELS: Record<NoteRevisionSummary['actorType'], () => string> = {
		owner: m.notes_actor_owner,
		api_key: m.notes_actor_api_key,
		system: m.notes_actor_system
	};

	const notifications = getNotifications();

	const draft = untrack(
		() =>
			new NoteDraft(
				{
					id: note?.id ?? null,
					title: note?.title ?? '',
					content: note?.content ?? emptyNoteContent(),
					version: note?.version ?? null
				},
				{
					send,
					onsaved,
					onfailed: (message) => notifications.fault(message || m.notes_save_failed())
				}
			)
	);

	/** Bumped to rebuild the editor from `draft.content` after the server state replaced it. */
	let generation = $state(0);
	let historyOpen = $state(false);

	const displayTitle = $derived(draft.title || m.notes_untitled());

	function actionUrl(id: string | null, action: string): string {
		return `${localizedHref(`/notes/${id ?? NEW_NOTE_ID}`)}?/${action}`;
	}

	async function post(url: string, body: FormData): Promise<ActionResult> {
		const response = await fetch(url, {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true' }
		});
		return deserialize(await response.text());
	}

	/** The first field error or message a failed action answered with. */
	function failureMessage(result: ActionResult, fallback: string): string {
		if (result.type !== 'failure') {
			return fallback;
		}
		const data = result.data ?? {};
		if (typeof data.message === 'string' && data.message.length > 0) {
			return data.message;
		}
		const errors = data.errors;
		if (typeof errors === 'object' && errors !== null) {
			const first = Object.values(errors).find((value) => typeof value === 'string');
			if (typeof first === 'string') {
				return first;
			}
		}
		return fallback;
	}

	async function send(request: SaveRequest): Promise<SaveResponse> {
		const body = new FormData();
		body.set('title', request.title);
		body.set('content', JSON.stringify(request.content));
		if (request.version !== null) {
			body.set('version', String(request.version));
		}

		const result = await post(
			actionUrl(request.id, request.id === null ? 'create' : 'save'),
			body
		);
		if (result.type === 'success' && typeof result.data?.id === 'string') {
			return { kind: 'saved', id: result.data.id, version: Number(result.data.version) };
		}
		if (result.type === 'failure' && result.data?.conflict === true) {
			return { kind: 'conflict', currentVersion: Number(result.data.currentVersion) };
		}
		return { kind: 'failed', message: failureMessage(result, m.notes_save_failed()) };
	}

	function onsaved(request: SaveRequest, saved: { id: string }): void {
		void (async () => {
			if (request.id === null) {
				await oncreated?.(saved.id);
			}
			// The sidebar lists notes by title and last change.
			await invalidate(SIDEBAR_DEPENDENCY);
		})();
	}

	async function upload(file: File): Promise<string | null> {
		if (file.size > uploadMaxBytes) {
			notifications.fault(
				m.validation_file_too_large({ max: formatMegabytes(uploadMaxBytes) })
			);
			return null;
		}
		const body = new FormData();
		body.set('image', file);
		try {
			const result = await post(actionUrl(draft.id, 'upload'), body);
			if (result.type === 'success' && typeof result.data?.src === 'string') {
				return result.data.src;
			}
			notifications.fault(failureMessage(result, m.notes_upload_failed()));
		} catch {
			notifications.fault(m.notes_upload_failed());
		}
		return null;
	}

	// A restored revision or a write from elsewhere arrives through `note`; it replaces the draft
	// only when no local change would be lost. Before rendering, so the editor is built once.
	$effect.pre(() => {
		if (note === null) {
			return;
		}
		const state = {
			id: note.id,
			title: note.title,
			content: note.content,
			version: note.version
		};
		untrack(() => {
			if (draft.adopt(state)) {
				generation += 1;
			}
		});
	});

	beforeNavigate(() => {
		void draft.flush();
	});

	function onVisibilityChange(): void {
		if (document.visibilityState === 'hidden') {
			void draft.flush();
		}
	}

	async function reload(): Promise<void> {
		await invalidate(NOTE_DEPENDENCY);
		if (note !== null) {
			draft.reset({
				id: note.id,
				title: note.title,
				content: note.content,
				version: note.version
			});
			generation += 1;
		}
	}

	function openHistory(): void {
		historyOpen = true;
		void invalidate(NOTE_DEPENDENCY);
	}

	const trashAfterSave: SubmitFunction = async () => {
		await draft.flush();
		draft.close();
		return async ({ result, update }) => {
			if (result.type === 'redirect') {
				notifications.confirm(m.notes_trashed());
			}
			await update();
		};
	};

	const restoreAfterSave: SubmitFunction = async () => {
		await draft.flush();
		return async ({ result, update }) => {
			if (result.type === 'redirect') {
				notifications.confirm(m.notes_revision_restored());
			}
			await update();
		};
	};
</script>

<svelte:head>
	<title>{pageTitle(page.data.organizationName, displayTitle)}</title>
	<meta name="description" content={m.notes_meta_description()} />
</svelte:head>

<svelte:document onvisibilitychange={onVisibilityChange} />

<article class="note-page">
	<header class="bar">
		<a class="back" href={localizedHref('/notes')}>{m.notes_all()}</a>
		<div class="tools">
			<p class="status" role="status">
				{#each STATUSES as status (status)}
					<span class="sizer" aria-hidden="true">{STATUS_LABELS[status]()}</span>
				{/each}
				<span class="current {draft.status}">{STATUS_LABELS[draft.status]()}</span>
			</p>
			<button
				type="button"
				class="tool"
				aria-label={m.notes_history()}
				title={m.notes_history()}
				disabled={draft.id === null}
				onclick={openHistory}
			>
				<History size={18} />
			</button>
			<form method="POST" action={actionUrl(draft.id, 'trash')} use:enhance={trashAfterSave}>
				<button
					type="submit"
					class="tool danger"
					aria-label={m.notes_trash_action()}
					title={m.notes_trash_action()}
					disabled={draft.id === null}
				>
					<TrashIcon />
				</button>
			</form>
		</div>
	</header>

	<h1 class="visually-hidden">{displayTitle}</h1>

	{#if preview}
		<div class="preview-bar">
			<p>{m.notes_preview_notice({ version: preview.version })}</p>
			<div class="preview-actions">
				<a class="quiet" href={localizedHref(`/notes/${draft.id}`)}
					>{m.notes_preview_back()}</a
				>
				<form
					method="POST"
					action={actionUrl(draft.id, 'restoreRevision')}
					use:enhance={restoreAfterSave}
				>
					<input type="hidden" name="revision" value={preview.version} />
					<button type="submit" class="primary">{m.notes_restore_revision()}</button>
				</form>
			</div>
		</div>
		<p class="title preview-title">{preview.title || m.notes_untitled()}</p>
		{#key preview.version}
			<NoteEditor
				content={preview.content}
				editable={false}
				label={m.notes_content_label()}
			/>
		{/key}
	{:else}
		<label class="visually-hidden" for="noteTitle">{m.notes_title_label()}</label>
		<input
			id="noteTitle"
			class="title"
			type="text"
			maxlength="200"
			autocomplete="off"
			placeholder={m.notes_untitled()}
			value={draft.title}
			oninput={(event) => draft.edit({ title: event.currentTarget.value })}
			onblur={() => draft.flush()}
		/>
		{#key generation}
			<NoteEditor
				content={draft.content}
				label={m.notes_content_label()}
				onchange={(content) => draft.edit({ content })}
				onblur={() => draft.flush()}
				onupload={upload}
			/>
		{/key}
	{/if}
</article>

{#if draft.status === 'conflict'}
	<div class="conflict" role="alert">
		<p>{m.notes_conflict()}</p>
		<div class="conflict-actions">
			<button type="button" class="quiet" onclick={reload}>{m.notes_conflict_reload()}</button
			>
			<button type="button" class="primary" onclick={() => draft.keepMine()}>
				{m.notes_conflict_keep()}
			</button>
		</div>
	</div>
{/if}

<Dialog bind:open={historyOpen} id="noteHistory" title={m.notes_history()}>
	{#if revisions.length === 0}
		<p class="history-empty">{m.notes_history_empty()}</p>
	{:else}
		<ol class="revisions">
			{#each revisions as revision (revision.version)}
				<li>
					<a
						href={localizedHref(`/notes/${draft.id}?revision=${revision.version}`)}
						aria-current={preview?.version === revision.version ? 'true' : undefined}
						onclick={() => (historyOpen = false)}
					>
						<span class="version"
							>{m.notes_history_version({ version: revision.version })}</span
						>
						<span class="meta">
							{ACTOR_LABELS[revision.actorType]()} ·
							<time datetime={revision.updatedAt.toISOString()}>
								{relativeTime(revision.updatedAt, getLocale())}
							</time>
						</span>
					</a>
				</li>
			{/each}
		</ol>
	{/if}
</Dialog>

<style lang="scss">
	@use '../../../../styles/colors' as clr;
	@use '../../../../styles/forms' as forms;
	@use '../../../../styles/variables' as vars;

	.note-page {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 1rem;
		width: 100%;
		max-width: 56rem;
		margin-inline: auto;
		padding: clamp(4.5rem, 10vw, 5.5rem) clamp(1.2rem, 4vw, 2rem) clamp(2.5rem, 6vw, 4rem);

		// The top bar already clears the account button on phones.
		@media (max-width: vars.$mobileMax) {
			padding: 1rem calc(1.1rem + env(safe-area-inset-right))
				calc(2.5rem + env(safe-area-inset-bottom)) calc(1.1rem + env(safe-area-inset-left));
		}
	}

	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;

		> .back {
			@include forms.mutedLink;
		}

		> .tools {
			display: flex;
			align-items: center;
			gap: 0.3rem;
		}
	}

	// Every label sits in the same cell, so the widest one sets the width and nothing moves.
	.status {
		display: grid;
		margin-right: 0.5rem;
		font-size: 0.66rem;
		letter-spacing: 0.14em;
		text-align: right;
		text-transform: uppercase;
		white-space: nowrap;
		color: clr.$textMutedColor;

		> span {
			grid-area: 1 / 1;
		}

		> .sizer {
			visibility: hidden;
		}

		> .failed,
		> .conflict {
			color: clr.$errorColor;
		}
	}

	.tool {
		@include forms.toolButton;
		border: 1px solid clr.$borderSubtleColor;

		&.danger:hover:not(:disabled) {
			color: clr.$errorColor;
			background-color: transparent;
		}
	}

	.title {
		width: 100%;
		padding: 0.3rem 0;
		font: inherit;
		font-size: clamp(1.6rem, 3.4vw, 2.2rem);
		font-weight: 700;
		line-height: 1.2;
		letter-spacing: -0.02em;
		color: clr.$textPrimaryColor;
		background-color: transparent;
		border: 0;
		border-bottom: 1px solid transparent;
		overflow-wrap: anywhere;

		&::placeholder {
			color: clr.$textMutedColor;
		}

		&:focus {
			outline: none;
			border-bottom-color: clr.$accentMutedColor;
		}
	}

	.preview-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem 1rem;
		padding: 0.6rem 0.9rem;
		background-color: clr.$accentWashColor;
		border: 1px solid clr.$accentMutedColor;
		border-radius: vars.$radius;

		> p {
			font-size: 0.82rem;
			color: clr.$textPrimaryColor;
		}

		> .preview-actions {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: 0.8rem;
		}
	}

	.primary {
		@include forms.primaryButton;
	}

	.quiet {
		@include forms.quietButton;
		text-decoration: none;
	}

	.conflict {
		position: fixed;
		right: max(1rem, env(safe-area-inset-right));
		bottom: max(1rem, env(safe-area-inset-bottom));
		left: max(1rem, env(safe-area-inset-left));
		z-index: 50;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem 1rem;
		max-width: 40rem;
		margin-inline: auto;
		padding: 0.8rem 1rem;
		background-color: clr.$panelColor;
		border: 1px solid clr.$errorColor;
		border-radius: vars.$radius;
		box-shadow: 0 10px 30px clr.$shadowColor;
		backdrop-filter: blur(10px);

		> p {
			font-size: 0.82rem;
			color: clr.$textPrimaryColor;
		}

		> .conflict-actions {
			display: flex;
			align-items: center;
			gap: 1rem;
		}
	}

	.history-empty {
		font-size: 0.86rem;
	}

	.revisions {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		margin: 0;
		padding: 0;
		list-style: none;

		> li > a {
			display: flex;
			flex-direction: column;
			gap: 0.1rem;
			min-height: vars.$touchTarget;
			padding: 0.5rem 0.7rem;
			text-decoration: none;
			border: 1px solid clr.$borderSubtleColor;
			border-radius: vars.$radius;

			&:hover,
			&[aria-current='true'] {
				border-color: clr.$accentColor;
				background-color: clr.$accentWashColor;
			}

			> .version {
				font-size: 0.86rem;
				color: clr.$textPrimaryColor;
			}

			> .meta {
				font-size: 0.72rem;
				color: clr.$textMutedColor;
			}
		}
	}
</style>
