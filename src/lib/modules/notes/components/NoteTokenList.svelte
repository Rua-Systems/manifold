<script lang="ts">
	import ConfirmDialog from '$lib/components/ConfirmDialog/ConfirmDialog.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import { getNotifications } from '$lib/state/notifications.svelte';
	import { localizedHref } from '$lib/utils/navigation';
	import { relativeTime } from '$lib/utils/time';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { noteTokenStatus } from '../tokens';
	import type { NoteTokenAccess, NoteTokenView } from '../types';

	interface Props {
		tokens: NoteTokenView[];
	}

	let { tokens }: Props = $props();

	const notifications = getNotifications();

	const ACCESS_LABELS: Record<NoteTokenAccess, () => string> = {
		read: m.note_tokens_access_read,
		edit: m.note_tokens_access_edit
	};

	const STATUS_LABELS = {
		active: m.api_keys_status_active,
		revoked: m.api_keys_status_revoked,
		expired: m.api_keys_status_expired
	};

	let revokeOpen = $state(false);
	let revoking = $state<NoteTokenView | null>(null);
	let deleteOpen = $state(false);
	let deleting = $state<NoteTokenView | null>(null);

	const dateFormat = $derived(
		new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeZone: 'UTC' })
	);

	function startRevoke(token: NoteTokenView): void {
		revoking = token;
		revokeOpen = true;
	}

	function startDelete(token: NoteTokenView): void {
		deleting = token;
		deleteOpen = true;
	}

	const confirmResult: SubmitFunction = () => {
		revokeOpen = false;
		deleteOpen = false;
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
</script>

{#if tokens.length === 0}
	<p class="empty">{m.note_tokens_settings_empty()}</p>
{:else}
	<ul class="tokens" aria-label={m.note_tokens_section()}>
		{#each tokens as token (token.id)}
			{@const status = noteTokenStatus(token)}
			<li class="card {status}">
				<div class="text">
					<p class="name">
						{token.name}
						<span class="state">{STATUS_LABELS[status]()}</span>
					</p>
					<p class="note">
						<a href={localizedHref(`/notes/${token.noteId}`)}>
							{token.noteTitle || m.notes_untitled()}
						</a>
						· {ACCESS_LABELS[token.access]()}
					</p>
					<p class="prefix"><code>mfn_{token.prefix}_…</code></p>
					<p class="meta">
						{m.note_tokens_expires_on({ date: dateFormat.format(token.expiresAt) })}
						·
						{token.lastUsedAt === null
							? m.api_keys_never_used()
							: m.api_keys_last_used({
									time: relativeTime(token.lastUsedAt, getLocale()),
									ip: token.lastUsedIp ?? m.security_unknown()
								})}
					</p>
				</div>
				<div class="actions">
					{#if status === 'active'}
						<button
							type="button"
							class="action"
							aria-label={m.note_tokens_revoke_named({ name: token.name })}
							onclick={() => startRevoke(token)}
						>
							{m.api_keys_revoke()}
						</button>
					{/if}
					<button
						type="button"
						class="action"
						aria-label={m.note_tokens_delete_named({ name: token.name })}
						onclick={() => startDelete(token)}
					>
						{m.common_delete()}
					</button>
				</div>
			</li>
		{/each}
	</ul>
{/if}

<ConfirmDialog
	bind:open={revokeOpen}
	id="noteTokenRevoke"
	title={m.note_tokens_revoke_title()}
	message={m.note_tokens_revoke_confirm({ name: revoking?.name ?? '' })}
	action="?/revokeNoteToken"
	fields={{ id: revoking?.id ?? '' }}
	confirmLabel={m.api_keys_revoke()}
	onresult={confirmResult}
/>
<ConfirmDialog
	bind:open={deleteOpen}
	id="noteTokenDelete"
	title={m.note_tokens_delete_title()}
	message={m.note_tokens_delete_confirm({ name: deleting?.name ?? '' })}
	action="?/deleteNoteToken"
	fields={{ id: deleting?.id ?? '' }}
	confirmLabel={m.common_delete()}
	onresult={confirmResult}
/>

<style lang="scss">
	@use '../../../../styles/colors' as clr;
	@use '../../../../styles/forms' as forms;
	@use '../../../../styles/variables' as vars;

	.empty {
		font-size: 0.86rem;
		color: clr.$textMutedColor;
	}

	.tokens {
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
		padding: 0.8rem 0.9rem;
		background-color: clr.$surfaceColor;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radius;

		&.revoked,
		&.expired {
			opacity: 0.65;
		}

		> .text {
			display: flex;
			flex: 1;
			flex-direction: column;
			gap: 0.3rem;
			min-width: 0;

			> .name {
				display: flex;
				flex-wrap: wrap;
				align-items: center;
				gap: 0.6rem;
				font-size: 0.9rem;
				color: clr.$textPrimaryColor;

				> .state {
					font-size: 0.62rem;
					letter-spacing: 0.16em;
					text-transform: uppercase;
					color: clr.$accentColor;
				}
			}

			> .note {
				font-size: 0.78rem;
				color: clr.$textSecondaryColor;

				> a {
					color: clr.$textPrimaryColor;
				}
			}

			> .prefix > code {
				font-size: 0.76rem;
				color: clr.$textSecondaryColor;
			}

			> .meta {
				font-size: 0.72rem;
				color: clr.$textMutedColor;
			}
		}

		> .actions {
			display: flex;
			flex: none;
			gap: 0.2rem;

			> .action {
				@include forms.quietButton;
				padding-inline: 0.5rem;

				&:hover:not(:disabled) {
					color: clr.$errorColor;
				}
			}
		}
	}

	.card.revoked > .text > .name > .state,
	.card.expired > .text > .name > .state {
		color: clr.$errorColor;
	}

	@media (max-width: vars.$mobileMax) {
		.card {
			flex-wrap: wrap;

			> .actions {
				justify-content: flex-end;
				width: 100%;
				padding-top: 0.4rem;
				border-top: 1px solid clr.$borderMutedColor;
			}
		}
	}
</style>
