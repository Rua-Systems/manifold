<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import Dialog from '$lib/components/Dialog/Dialog.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import { getNotifications } from '$lib/state/notifications.svelte';
	import { getStepUp, needsStepUp } from '$lib/state/step-up.svelte';
	import type { FieldErrors } from '$lib/types/validation';
	import { localizedHref } from '$lib/utils/navigation';
	import Share2 from '@lucide/svelte/icons/share-2';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { NOTE_DEPENDENCY } from '../paths';
	import { defaultNoteTokenExpiry, NOTE_TOKEN_NAME_MAX_LENGTH } from '../schemas';
	import { noteTokenStatus } from '../tokens';
	import type { NoteTokenAccess, NoteTokenView } from '../types';

	interface Props {
		noteId: string;
		/** The note's tokens, newest first. */
		tokens: NoteTokenView[];
	}

	let { noteId, tokens }: Props = $props();

	const notifications = getNotifications();
	const stepUp = getStepUp();

	const ACCESS_LABELS: Record<NoteTokenAccess, () => string> = {
		read: m.note_tokens_access_read,
		edit: m.note_tokens_access_edit
	};

	const STATUS_LABELS = {
		active: m.api_keys_status_active,
		revoked: m.api_keys_status_revoked,
		expired: m.api_keys_status_expired
	};

	let open = $state(false);
	let errors = $state<FieldErrors>({});
	let expires = $state(defaultNoteTokenExpiry());
	/** The new token, shown until the dialog closes; it cannot be read again afterwards. */
	let created = $state<{ link: string; token: string } | null>(null);

	const dateFormat = $derived(
		new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeZone: 'UTC' })
	);

	function show(): void {
		created = null;
		errors = {};
		expires = defaultNoteTokenExpiry();
		open = true;
	}

	async function copy(value: string): Promise<void> {
		await navigator.clipboard.writeText(value);
		notifications.confirm(m.note_tokens_copied());
	}

	const submit: SubmitFunction = ({ formElement, submitter }) => {
		return async ({ result }) => {
			if (needsStepUp(result)) {
				if (await stepUp.request()) {
					formElement.requestSubmit(submitter);
				}
				return;
			}
			if (result.type === 'failure') {
				errors = (result.data?.errors as FieldErrors | undefined) ?? {};
				return;
			}
			if (
				result.type === 'success' &&
				typeof result.data?.link === 'string' &&
				typeof result.data?.token === 'string'
			) {
				created = { link: result.data.link, token: result.data.token };
				errors = {};
				formElement.reset();
				expires = defaultNoteTokenExpiry();
				notifications.confirm(m.note_tokens_created());
				await invalidate(NOTE_DEPENDENCY);
			}
		};
	};
</script>

<button
	type="button"
	class="tool"
	aria-label={m.note_tokens_share()}
	title={m.note_tokens_share()}
	onclick={show}
>
	<Share2 size={18} />
</button>

<Dialog bind:open id="noteTokens" title={m.note_tokens_title()}>
	<div class="share">
		<p class="lead">{m.note_tokens_lead()}</p>
		{#if created !== null}
			<div class="created" role="status">
				<p>{m.note_tokens_new_lead()}</p>
				<p class="label">{m.note_tokens_link()}</p>
				<code>{created.link}</code>
				<button type="button" onclick={() => copy(created?.link ?? '')}>
					{m.note_tokens_copy_link()}
				</button>
				<p class="label">{m.note_tokens_token()}</p>
				<code>{created.token}</code>
				<button type="button" onclick={() => copy(created?.token ?? '')}>
					{m.note_tokens_copy_token()}
				</button>
			</div>
		{/if}
		<form
			method="POST"
			action="{localizedHref(`/notes/${noteId}`)}?/createToken"
			use:enhance={submit}
			novalidate
		>
			<div class="field">
				<label for="noteTokenName">{m.note_tokens_name()}</label>
				<input
					id="noteTokenName"
					name="name"
					type="text"
					autocomplete="off"
					maxlength={NOTE_TOKEN_NAME_MAX_LENGTH}
					aria-invalid={(errors.name ?? '').length > 0}
					aria-describedby="noteTokenNameHint noteTokenNameError"
				/>
				<p class="hint" id="noteTokenNameHint">{m.note_tokens_name_hint()}</p>
				<p class="error" id="noteTokenNameError">{errors.name ?? ''}</p>
			</div>
			<fieldset class="access" aria-describedby="noteTokenAccessError">
				<legend>{m.note_tokens_access()}</legend>
				<label>
					<input type="radio" name="access" value="read" checked />
					<span>{m.note_tokens_access_read()}</span>
				</label>
				<label>
					<input type="radio" name="access" value="edit" />
					<span>{m.note_tokens_access_edit()}</span>
				</label>
			</fieldset>
			<p class="error" id="noteTokenAccessError">{errors.access ?? ''}</p>
			<div class="field">
				<label for="noteTokenExpires">{m.note_tokens_expires()}</label>
				<input
					id="noteTokenExpires"
					name="expires"
					type="date"
					required
					bind:value={expires}
					aria-invalid={(errors.expires ?? '').length > 0}
					aria-describedby="noteTokenExpiresHint noteTokenExpiresError"
				/>
				<p class="hint" id="noteTokenExpiresHint">{m.note_tokens_expires_hint()}</p>
				<p class="error" id="noteTokenExpiresError">{errors.expires ?? ''}</p>
			</div>
			<button type="submit" class="primary">{m.note_tokens_create()}</button>
		</form>
		<section class="existing" aria-labelledby="noteTokensExisting">
			<h3 id="noteTokensExisting">{m.note_tokens_existing()}</h3>
			{#if tokens.length === 0}
				<p class="empty">{m.note_tokens_empty()}</p>
			{:else}
				<ul>
					{#each tokens as token (token.id)}
						{@const status = noteTokenStatus(token)}
						<li class={status}>
							<span class="name">{token.name}</span>
							<span class="meta">
								{ACCESS_LABELS[token.access]()} ·
								{m.note_tokens_expires_on({
									date: dateFormat.format(token.expiresAt)
								})} ·
								<span class="state">{STATUS_LABELS[status]()}</span>
							</span>
						</li>
					{/each}
				</ul>
			{/if}
			<p class="manage">
				<a href={localizedHref('/settings/api-keys')}>{m.note_tokens_manage()}</a>
			</p>
		</section>
	</div>
</Dialog>

<style lang="scss">
	@use '../../../../styles/colors' as clr;
	@use '../../../../styles/forms' as forms;
	@use '../../../../styles/variables' as vars;

	.tool {
		@include forms.framedToolButton;
	}

	.share {
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
		max-width: 34rem;

		> .lead {
			font-size: 0.82rem;
			color: clr.$textSecondaryColor;
		}

		> form {
			display: flex;
			flex-direction: column;
			gap: 0.9rem;

			> .primary {
				@include forms.primaryButton;
				align-self: flex-start;
			}

			> .error {
				@include forms.fieldError;
			}
		}
	}

	.created {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 1rem;
		background-color: clr.$accentWashColor;
		border: 1px solid clr.$accentMutedColor;
		border-radius: vars.$radius;

		> p {
			font-size: 0.82rem;
			color: clr.$textPrimaryColor;
		}

		> .label {
			margin-top: 0.4rem;
			font-size: 0.66rem;
			letter-spacing: 0.16em;
			text-transform: uppercase;
			color: clr.$textMutedColor;
		}

		> code {
			font-size: 0.8rem;
			color: clr.$textPrimaryColor;
			overflow-wrap: anywhere;
		}

		> button {
			@include forms.framedButton;
			align-self: flex-start;
		}
	}

	.field {
		> label {
			@include forms.fieldLabel;
		}

		> input {
			@include forms.textInput;
		}

		> .hint {
			margin-top: 0.35rem;
			font-size: 0.7rem;
			color: clr.$textMutedColor;
		}

		> .error {
			@include forms.fieldError;
		}
	}

	.access {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem 1.2rem;
		margin: 0;
		padding: 0;
		border: 0;

		> legend {
			@include forms.fieldLabel;
			padding: 0;
		}

		> label {
			display: inline-flex;
			align-items: center;
			gap: 0.5rem;
			min-height: vars.$touchTarget;
			font-size: 0.82rem;
			color: clr.$textSecondaryColor;
			cursor: pointer;

			> input {
				width: 1.05rem;
				height: 1.05rem;
				accent-color: clr.$accentColor;
			}
		}
	}

	.existing {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding-top: 1rem;
		border-top: 1px solid clr.$borderMutedColor;

		> h3 {
			font-size: 0.66rem;
			font-weight: 400;
			letter-spacing: 0.18em;
			text-transform: uppercase;
			color: clr.$textMutedColor;
		}

		> .empty {
			font-size: 0.8rem;
			color: clr.$textMutedColor;
		}

		> ul {
			display: flex;
			flex-direction: column;
			gap: 0.45rem;
			margin: 0;
			padding: 0;
			list-style: none;

			> li {
				display: flex;
				flex-direction: column;
				gap: 0.15rem;

				> .name {
					font-size: 0.86rem;
					color: clr.$textPrimaryColor;
				}

				> .meta {
					font-size: 0.72rem;
					color: clr.$textMutedColor;

					> .state {
						color: clr.$accentColor;
					}
				}

				&.revoked,
				&.expired {
					opacity: 0.65;

					> .meta > .state {
						color: clr.$errorColor;
					}
				}
			}
		}

		> .manage > a {
			@include forms.mutedLink;
			font-size: 0.76rem;
		}
	}
</style>
