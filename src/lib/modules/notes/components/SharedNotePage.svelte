<script lang="ts">
	import { enhance } from '$app/forms';
	import { beforeNavigate, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import AuthShell from '$lib/components/AuthShell/AuthShell.svelte';
	import ManifoldLogo from '$lib/components/ManifoldLogo/ManifoldLogo.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import { getNotifications } from '$lib/state/notifications.svelte';
	import { actionMessage, postAction } from '$lib/utils/actions';
	import { localizedHref } from '$lib/utils/navigation';
	import { pageTitle } from '$lib/utils/title';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { onDestroy, onMount, untrack } from 'svelte';
	import { emptyNoteContent } from '../content';
	import {
		NoteDraft,
		type SaveRequest,
		type SaveResponse,
		type SaveStatus
	} from '../draft.svelte';
	import type { NoteTokenAccess, SharedNote } from '../types';
	import NoteEditor from './NoteEditor.svelte';

	interface Props {
		shared: SharedNote | null;
		/** The answer of `open` or `close` without JavaScript, or after it. */
		form: { message?: string; closed?: boolean } | null | undefined;
	}

	let { shared, form }: Props = $props();

	const STATUS_LABELS: Record<SaveStatus, () => string> = {
		idle: () => '',
		saved: m.notes_status_saved,
		unsaved: m.notes_status_unsaved,
		saving: m.notes_status_saving,
		failed: m.notes_status_failed,
		conflict: m.notes_status_conflict
	};

	const STATUSES: SaveStatus[] = ['idle', 'saved', 'unsaved', 'saving', 'failed', 'conflict'];

	const ACCESS_LABELS: Record<NoteTokenAccess, () => string> = {
		read: m.note_tokens_access_read,
		edit: m.note_tokens_access_edit
	};

	const notifications = getNotifications();

	let tokenInput: HTMLInputElement | undefined = $state();
	let openForm: HTMLFormElement | undefined = $state();
	/** Set while the token from the link's fragment is being exchanged. */
	let opening = $state(false);
	/** Bumped to rebuild the editor from `draft.content` after the server state replaced it. */
	let generation = $state(0);

	const draft = untrack(
		() =>
			new NoteDraft(
				{
					id: shared?.id ?? null,
					title: shared?.title ?? '',
					content: shared?.content ?? emptyNoteContent(),
					version: shared?.version ?? null
				},
				{
					send,
					onfailed: (message) => notifications.fault(message || m.notes_save_failed())
				}
			)
	);

	const editable = $derived(shared?.access === 'edit');
	const displayTitle = $derived(draft.title || m.notes_untitled());
	const dateFormat = $derived(
		new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeZone: 'UTC' })
	);

	async function send(request: SaveRequest): Promise<SaveResponse> {
		const result = await postAction(`${localizedHref('/shared')}?/save`, {
			title: request.title,
			content: JSON.stringify(request.content),
			version: String(request.version ?? 1)
		});
		if (result.type === 'success' && typeof result.data?.id === 'string') {
			return { kind: 'saved', id: result.data.id, version: Number(result.data.version) };
		}
		if (result.type === 'failure' && result.data?.conflict === true) {
			return { kind: 'conflict', currentVersion: Number(result.data.currentVersion) };
		}
		return { kind: 'failed', message: actionMessage(result, m.notes_save_failed()) };
	}

	// A note just opened replaces the empty draft; a newer state of the same note replaces it when
	// nothing local would be lost.
	$effect.pre(() => {
		if (shared === null) {
			return;
		}
		const state = {
			id: shared.id,
			title: shared.title,
			content: shared.content,
			version: shared.version
		};
		untrack(() => {
			if (draft.id !== state.id) {
				draft.reset(state);
				generation += 1;
				return;
			}
			if (draft.adopt(state)) {
				generation += 1;
			}
		});
	});

	// The link carries the token in its fragment, which never reaches the server; it is taken out
	// of the address at once and posted, so it stays neither in the address bar nor in the history.
	onMount(() => {
		const fragment = window.location.hash.slice(1);
		if (shared !== null || !fragment.startsWith('mfn_') || tokenInput === undefined) {
			return;
		}
		replaceState(localizedHref('/shared'), page.state);
		tokenInput.value = fragment;
		opening = true;
		openForm?.requestSubmit();
	});

	beforeNavigate(() => {
		void draft.flush();
	});

	onDestroy(() => {
		void draft.flush();
	});

	function onVisibilityChange(): void {
		if (document.visibilityState === 'hidden') {
			void draft.flush();
		}
	}

	function onKeydown(event: KeyboardEvent): void {
		const modifier = event.ctrlKey || event.metaKey;
		if (modifier && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 's') {
			event.preventDefault();
			void draft.flush();
		}
	}

	const openResult: SubmitFunction = () => {
		return async ({ update }) => {
			await update();
			opening = false;
		};
	};

	const closeResult: SubmitFunction = async () => {
		await draft.flush();
		draft.close();
		return async ({ update }) => {
			await update();
		};
	};

	/** Drops the local edit for the note as saved elsewhere. */
	function reload(): void {
		window.location.reload();
	}
</script>

<svelte:head>
	{#if shared === null}
		<title>{pageTitle(page.data.organizationName, m.shared_title())}</title>
	{:else}
		<title>{pageTitle(page.data.organizationName, displayTitle)}</title>
	{/if}
	<meta name="description" content={m.shared_meta_description()} />
</svelte:head>

<svelte:document onvisibilitychange={onVisibilityChange} />
<svelte:window onkeydown={onKeydown} />

{#if shared === null}
	<AuthShell>
		<div class="intro">
			<p class="sigil">++ {m.shared_sigil()} ++</p>
			<h1>{m.shared_title()}</h1>
			<p class="lead">{m.shared_lead()}</p>
		</div>
		<form
			method="POST"
			action="?/open"
			class="open"
			use:enhance={openResult}
			bind:this={openForm}
			novalidate
		>
			<div class="field">
				<label for="sharedToken">{m.shared_token()}</label>
				<input
					bind:this={tokenInput}
					id="sharedToken"
					name="token"
					type="password"
					autocomplete="off"
					spellcheck="false"
					aria-invalid={(form?.message ?? '').length > 0}
					aria-describedby="sharedNotice"
				/>
			</div>
			<div class="submit">
				<p class="notice" id="sharedNotice" role="alert">
					{#if opening}
						{m.shared_opening()}
					{:else if form?.closed}
						{m.shared_closed()}
					{:else}
						{form?.message ?? ''}
					{/if}
				</p>
				<button type="submit" disabled={opening}>{m.shared_open()}</button>
			</div>
		</form>
	</AuthShell>
{:else}
	<article class="shared">
		<header class="bar">
			<p class="brand">
				<span class="mark" aria-hidden="true"><ManifoldLogo /></span>
				<span>{page.data.organizationName}</span>
			</p>
			<p class="grant">
				<span class="access">{ACCESS_LABELS[shared.access]()}</span>
				<span
					>{m.note_tokens_expires_on({ date: dateFormat.format(shared.expiresAt) })}</span
				>
			</p>
			<div class="tools">
				{#if editable}
					<p class="status" role="status">
						{#each STATUSES as status (status)}
							<span class="sizer" aria-hidden="true">{STATUS_LABELS[status]()}</span>
						{/each}
						<span class="current {draft.status}">{STATUS_LABELS[draft.status]()}</span>
					</p>
				{/if}
				<form method="POST" action="?/close" use:enhance={closeResult}>
					<button type="submit" class="quiet">{m.shared_close()}</button>
				</form>
			</div>
		</header>
		{#if editable}
			<h1 class="visually-hidden">{displayTitle}</h1>
			<label class="visually-hidden" for="sharedTitle">{m.notes_title_label()}</label>
			<input
				id="sharedTitle"
				class="title"
				type="text"
				maxlength="200"
				autocomplete="off"
				placeholder={m.notes_untitled()}
				value={draft.title}
				oninput={(event) => draft.edit({ title: event.currentTarget.value })}
				onblur={() => draft.flush()}
			/>
		{:else}
			<h1 class="title" class:untitled={draft.title === ''}>{displayTitle}</h1>
		{/if}
		{#key generation}
			<NoteEditor
				content={draft.content}
				{editable}
				label={m.notes_content_label()}
				onchange={(content) => draft.edit({ content })}
				onblur={() => draft.flush()}
			/>
		{/key}
	</article>
	{#if draft.status === 'conflict'}
		<div class="conflict" role="alert">
			<p>{m.notes_conflict()}</p>
			<div class="conflict-actions">
				<button type="button" class="quiet" onclick={reload}>
					{m.notes_conflict_reload()}
				</button>
				<button type="button" class="primary" onclick={() => draft.keepMine()}>
					{m.notes_conflict_keep()}
				</button>
			</div>
		</div>
	{/if}
{/if}

<style lang="scss">
	@use '../../../../styles/colors' as clr;
	@use '../../../../styles/forms' as forms;
	@use '../../../../styles/variables' as vars;

	.intro {
		margin-bottom: 0.4rem;

		> .sigil {
			@include forms.sigil;
		}

		> h1 {
			margin-top: 0.7rem;
			@include forms.heading;
		}

		> .lead {
			margin-top: 0.6rem;
			@include forms.lead;
		}
	}

	.open {
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
	}

	.submit {
		@include forms.submitGroup;

		> button {
			@include forms.primaryButton;
		}
	}

	.notice {
		@include forms.formNotice;
	}

	.shared {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 1rem;
		width: 100%;
		max-width: 56rem;
		margin-inline: auto;
		padding: clamp(1.5rem, 5vw, 2.5rem) clamp(1.2rem, 4vw, 2rem) clamp(2.5rem, 6vw, 4rem);
	}

	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem 1.2rem;
		padding-bottom: 0.9rem;
		border-bottom: 1px solid clr.$borderMutedColor;

		> .brand {
			display: inline-flex;
			align-items: center;
			gap: 0.5rem;
			font-size: 0.78rem;
			letter-spacing: 0.12em;
			text-transform: uppercase;
			color: clr.$textPrimaryColor;

			> .mark {
				display: inline-flex;
				width: 1.4rem;
				height: 1.4rem;
				color: clr.$accentColor;
			}
		}

		> .grant {
			display: flex;
			flex-wrap: wrap;
			gap: 0.3rem 0.8rem;
			font-size: 0.72rem;
			color: clr.$textMutedColor;

			> .access {
				letter-spacing: 0.14em;
				text-transform: uppercase;
				color: clr.$accentColor;
			}
		}

		> .tools {
			display: flex;
			align-items: center;
			gap: 0.6rem;
			margin-left: auto;
		}
	}

	// Every label sits in the same cell, so the widest one sets the width and nothing moves.
	.status {
		display: grid;
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

		&.untitled {
			color: clr.$textMutedColor;
		}
	}

	.primary {
		@include forms.primaryButton;
	}

	.quiet {
		@include forms.quietButton;
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
</style>
