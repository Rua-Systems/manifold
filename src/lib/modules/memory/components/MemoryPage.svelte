<script lang="ts">
	import { enhance } from '$app/forms';
	import { beforeNavigate } from '$app/navigation';
	import Dialog from '$lib/components/Dialog/Dialog.svelte';
	import TrashIcon from '$lib/components/icons/TrashIcon.svelte';
	import PageShell from '$lib/components/PageShell/PageShell.svelte';
	import TagPicker from '$lib/components/Tags/TagPicker.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import { getNotifications } from '$lib/state/notifications.svelte';
	import type { Tag } from '$lib/types/tags';
	import type { FieldErrors } from '$lib/types/validation';
	import { localizedHref } from '$lib/utils/navigation';
	import { relativeTime } from '$lib/utils/time';
	import History from '@lucide/svelte/icons/history';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { tick, untrack } from 'svelte';
	import { emptyNoteContent, type NoteContent } from '../../notes/content';
	import NoteEditor from '../../notes/components/NoteEditor.svelte';
	import { categoryLabel } from '../categories';
	import { MEMORY_TITLE_MAX_LENGTH } from '../schemas';
	import type {
		MemoryCategory,
		MemoryDetail,
		MemoryPreview,
		MemoryRevisionSummary
	} from '../types';
	import CategorySelect from './CategorySelect.svelte';

	/** What the save action answers. */
	interface SaveForm {
		saved?: boolean;
		conflict?: boolean;
		currentVersion?: number | null;
		errors?: FieldErrors;
	}

	interface Props {
		/** Null for a memory not saved yet. */
		memory: MemoryDetail | null;
		revisions: MemoryRevisionSummary[];
		/** A revision shown read only instead of the editor. */
		preview: MemoryPreview | null;
		categories: MemoryCategory[];
		tags: Tag[];
		/** The category a new memory starts in. */
		newCategoryId: string | null;
		form: SaveForm | null | undefined;
	}

	let { memory, revisions, preview, categories, tags, newCategoryId, form }: Props = $props();

	const notifications = getNotifications();
	const initial = untrack(() => memory);

	let title = $state(initial?.title ?? '');
	let content = $state<NoteContent>(initial?.content ?? emptyNoteContent());
	let category = $state(initial?.categoryId ?? untrack(() => newCategoryId) ?? '');
	let chosenTags = $state<string[]>(initial?.tags.map((item) => item.id) ?? []);
	let pinned = $state(initial?.pinned ?? false);
	let version = $state(initial?.version ?? 1);
	let dirty = $state(false);
	let saving = $state(false);
	let conflict = $state<number | null>(null);
	let historyOpen = $state(false);
	let saveForm: HTMLFormElement | undefined = $state();

	const errors = $derived<FieldErrors>(form?.errors ?? {});
	const pageTitle = $derived(title.trim() || m.memory_new());

	const ACTORS = {
		owner: () => m.memory_actor_owner(),
		system: () => m.memory_actor_system()
	};

	function actorOf(revision: MemoryRevisionSummary): string {
		if (revision.actorType === 'api_key') {
			if (revision.actorName === null) {
				return m.memory_actor_key_deleted();
			}
			return m.memory_actor_key({ name: revision.actorName });
		}
		return ACTORS[revision.actorType]();
	}

	function changed(): void {
		dirty = true;
	}

	function onKeydown(event: KeyboardEvent): void {
		// Ctrl+S saves at once instead of offering to save the page as a file. Ctrl+Shift+S stays
		// the editor's strikethrough.
		const modifier = event.ctrlKey || event.metaKey;
		if (modifier && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 's') {
			event.preventDefault();
			if (preview === null && !saving) {
				saveForm?.requestSubmit();
			}
		}
	}

	beforeNavigate((navigation) => {
		if (dirty && !saving && !confirm(m.memory_leave_unsaved())) {
			navigation.cancel();
		}
	});

	const save: SubmitFunction = () => {
		saving = true;
		return async ({ result, update }) => {
			saving = false;
			if (result.type === 'redirect') {
				dirty = false;
				notifications.confirm(m.memory_saved());
			}
			if (result.type === 'success' && typeof result.data?.version === 'number') {
				version = result.data.version;
				dirty = false;
				conflict = null;
				notifications.confirm(m.memory_saved());
			}
			if (result.type === 'failure' && result.data?.conflict === true) {
				conflict = Number(result.data.currentVersion);
			}
			await update({ reset: false });
		};
	};

	/** Saves this text over the newer version, which stays in the history. */
	async function keepMine(): Promise<void> {
		if (conflict === null) {
			return;
		}
		version = conflict;
		conflict = null;
		// The form posts the version field, which shows the new version only after an update.
		await tick();
		saveForm?.requestSubmit();
	}

	function reload(): void {
		dirty = false;
		window.location.reload();
	}

	const trashSubmit: SubmitFunction = () => {
		dirty = false;
		return async ({ result, update }) => {
			if (result.type === 'redirect') {
				notifications.confirm(m.memory_trashed());
			}
			await update();
		};
	};
</script>

<svelte:window onkeydown={onKeydown} />

<PageShell
	title={pageTitle}
	sigil={m.memory_sigil()}
	metaDescription={m.memory_page_meta_description()}
>
	{#snippet actions()}
		<a class="quiet" href={localizedHref('/memory')}>{m.memory_all()}</a>
		{#if memory !== null}
			<button
				type="button"
				class="tool"
				aria-label={m.memory_history()}
				title={m.memory_history()}
				onclick={() => (historyOpen = true)}
			>
				<History size={18} />
			</button>
			<form method="POST" action="?/trash" use:enhance={trashSubmit}>
				<button
					type="submit"
					class="tool danger"
					aria-label={m.memory_trash_action()}
					title={m.memory_trash_action()}
				>
					<TrashIcon />
				</button>
			</form>
		{/if}
	{/snippet}

	{#if preview !== null && memory !== null}
		<div class="preview-bar">
			<p>{m.memory_preview_notice({ version: preview.version })}</p>
			<div class="preview-actions">
				<a class="quiet" href={localizedHref(`/memory/${memory.id}`)}>
					{m.memory_preview_back()}
				</a>
				<form method="POST" action="?/restoreRevision" use:enhance>
					<input type="hidden" name="revision" value={preview.version} />
					<button type="submit" class="primary">{m.memory_restore_revision()}</button>
				</form>
			</div>
		</div>
		<p class="title preview-title">{preview.title}</p>
		{#key preview.version}
			<NoteEditor
				content={preview.content}
				editable={false}
				label={m.memory_content_label()}
			/>
		{/key}
	{:else}
		<form
			method="POST"
			action="?/save"
			class="memory"
			use:enhance={save}
			bind:this={saveForm}
			novalidate
		>
			<input type="hidden" name="version" value={version} />
			<input type="hidden" name="content" value={JSON.stringify(content)} />
			<div class="field">
				<label class="visually-hidden" for="memoryTitle">{m.memory_title_label()}</label>
				<input
					id="memoryTitle"
					class="title"
					name="title"
					type="text"
					maxlength={MEMORY_TITLE_MAX_LENGTH}
					autocomplete="off"
					placeholder={m.memory_title_placeholder()}
					aria-invalid={(errors.title ?? '').length > 0}
					aria-describedby="memoryTitleError"
					bind:value={title}
					oninput={changed}
				/>
				<p class="error" id="memoryTitleError">{errors.title ?? ''}</p>
			</div>
			<div class="details">
				<div class="field">
					<label for="memoryCategory">{m.memory_category()}</label>
					<CategorySelect
						id="memoryCategory"
						{categories}
						bind:value={category}
						emptyLabel={m.memory_category_none()}
						describedBy="memoryCategoryError"
						invalid={(errors.category ?? '').length > 0}
						onchange={changed}
					/>
					<p class="error" id="memoryCategoryError">{errors.category ?? ''}</p>
				</div>
				<label class="pin">
					<input type="checkbox" name="pinned" bind:checked={pinned} onchange={changed} />
					<span>{m.memory_pin()}</span>
				</label>
			</div>
			<p class="hint">{m.memory_pin_hint()}</p>
			<TagPicker
				{tags}
				bind:selected={chosenTags}
				legend={m.memory_tags()}
				error={errors.tags ?? ''}
				idPrefix="memoryTags"
				onchange={changed}
			/>
			<NoteEditor
				{content}
				label={m.memory_content_label()}
				onchange={(next) => {
					content = next;
					changed();
				}}
			/>
			<div class="submit">
				<p class="notice" role="alert">{errors.content ?? errors.version ?? ''}</p>
				<p class="status" role="status">
					{#if dirty}
						{m.memory_unsaved()}
					{/if}
				</p>
				<button type="submit" class="primary" disabled={saving}>{m.common_save()}</button>
			</div>
		</form>
	{/if}

	{#if memory !== null && revisions.length > 0}
		<p class="trail">
			{m.memory_trail({
				who: actorOf(revisions[0]),
				time: relativeTime(revisions[0].updatedAt, getLocale())
			})}
			{#if memory.categoryId !== null}
				· {categoryLabel(categories, memory.categoryId)}
			{/if}
		</p>
	{/if}
</PageShell>

{#if conflict !== null}
	<div class="conflict" role="alert">
		<p>{m.memory_conflict()}</p>
		<div class="conflict-actions">
			<button type="button" class="quiet" onclick={reload}>{m.notes_conflict_reload()}</button
			>
			<button type="button" class="primary" onclick={keepMine}>
				{m.notes_conflict_keep()}
			</button>
		</div>
	</div>
{/if}

{#if memory !== null}
	<Dialog bind:open={historyOpen} id="memoryHistory" title={m.memory_history()}>
		<ol class="revisions">
			{#each revisions as revision (revision.version)}
				<li>
					<a
						href="{localizedHref(`/memory/${memory.id}`)}?revision={revision.version}"
						aria-current={preview?.version === revision.version ? 'true' : undefined}
						onclick={() => (historyOpen = false)}
					>
						<span class="version">
							{m.notes_history_version({ version: revision.version })}
						</span>
						<span class="meta">
							{actorOf(revision)} ·
							<time datetime={revision.updatedAt.toISOString()}>
								{relativeTime(revision.updatedAt, getLocale())}
							</time>
						</span>
					</a>
				</li>
			{/each}
		</ol>
	</Dialog>
{/if}

<style lang="scss">
	@use '../../../../styles/colors' as clr;
	@use '../../../../styles/forms' as forms;
	@use '../../../../styles/variables' as vars;

	.memory {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		max-width: 52rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		min-width: 0;

		> label {
			@include forms.fieldLabel;
		}

		> .error {
			@include forms.fieldError;
		}
	}

	.title {
		width: 100%;
		padding: 0.3rem 0;
		font: inherit;
		font-size: clamp(1.4rem, 3vw, 1.9rem);
		font-weight: 700;
		line-height: 1.2;
		letter-spacing: -0.02em;
		color: clr.$textPrimaryColor;
		background-color: transparent;
		border: 0;
		border-bottom: 1px solid clr.$borderSubtleColor;
		overflow-wrap: anywhere;

		&::placeholder {
			color: clr.$textMutedColor;
		}

		&:focus {
			outline: none;
			border-bottom-color: clr.$accentColor;
		}
	}

	.details {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem 1.4rem;

		> .field {
			flex: 0 1 22rem;
		}
	}

	.pin {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-height: vars.$touchTarget;
		font-size: 0.86rem;
		color: clr.$textSecondaryColor;
		cursor: pointer;

		> input {
			width: 1.05rem;
			height: 1.05rem;
			accent-color: clr.$accentColor;
		}
	}

	.hint {
		margin-top: -0.6rem;
		font-size: 0.72rem;
		color: clr.$textMutedColor;
	}

	.submit {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: 0.6rem 1rem;
		padding-top: 0.6rem;
		border-top: 1px solid clr.$borderMutedColor;

		> .notice {
			@include forms.formNotice;
			flex: 1 1 100%;
		}

		> .status {
			min-height: 1.2em;
			font-size: 0.66rem;
			letter-spacing: 0.14em;
			text-transform: uppercase;
			color: clr.$textMutedColor;
		}
	}

	.primary {
		@include forms.primaryButton;
	}

	.quiet {
		@include forms.framedButton;
		display: inline-flex;
		align-items: center;
		text-decoration: none;
	}

	.tool {
		@include forms.framedToolButton;

		&.danger:hover:not(:disabled) {
			color: clr.$errorColor;
			@include forms.frostedBacking;
		}
	}

	.trail {
		margin-top: 1rem;
		font-size: 0.72rem;
		color: clr.$textMutedColor;
	}

	.preview-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem 1rem;
		margin-bottom: 0.8rem;
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

	.preview-title {
		border-bottom: 0;
	}

	.conflict {
		position: fixed;
		right: max(1rem, env(safe-area-inset-right));
		bottom: max(1rem, env(safe-area-inset-bottom));
		left: max(1rem, env(safe-area-inset-left));
		z-index: 135;
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

	@media (max-width: vars.$mobileMax) {
		.submit > .primary {
			flex: 1;
		}
	}
</style>
