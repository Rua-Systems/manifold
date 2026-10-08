<script lang="ts">
	import { enhance } from '$app/forms';
	import ConfirmDialog from '$lib/components/ConfirmDialog/ConfirmDialog.svelte';
	import Dialog from '$lib/components/Dialog/Dialog.svelte';
	import PageShell from '$lib/components/PageShell/PageShell.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { getNotifications } from '$lib/state/notifications.svelte';
	import { getStepUp, needsStepUp } from '$lib/state/step-up.svelte';
	import { localizedHref } from '$lib/utils/navigation';
	import Copy from '@lucide/svelte/icons/copy';
	import Eye from '@lucide/svelte/icons/eye';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { onDestroy } from 'svelte';
	import type { VaultSecretView } from '../types';
	import SecretForm from './SecretForm.svelte';

	interface Props {
		secrets: VaultSecretView[];
		/** A value revealed without JavaScript, from the form action. */
		revealed: { id: string; value: string } | null;
		stepUpNeeded: boolean;
	}

	let { secrets, revealed: fromForm, stepUpNeeded }: Props = $props();

	/** How long a revealed value stays on screen. */
	const REVEAL_MS = 30_000;

	const notifications = getNotifications();
	const stepUp = getStepUp();

	let shown = $state<Record<string, string>>({});
	// Not state: only the hide timers of values on screen, never rendered.
	const timers: Record<string, ReturnType<typeof setTimeout>> = {};

	let createOpen = $state(false);
	let editOpen = $state(false);
	let editing = $state<VaultSecretView | null>(null);
	let deleteOpen = $state(false);
	let deleting = $state<VaultSecretView | null>(null);

	function valueOf(id: string): string | null {
		if (shown[id] !== undefined) {
			return shown[id];
		}
		return fromForm?.id === id ? fromForm.value : null;
	}

	function hide(id: string): void {
		clearTimeout(timers[id]);
		delete timers[id];
		shown = Object.fromEntries(Object.entries(shown).filter(([key]) => key !== id));
	}

	function show(id: string, value: string): void {
		hide(id);
		shown = { ...shown, [id]: value };
		timers[id] = setTimeout(() => hide(id), REVEAL_MS);
	}

	onDestroy(() => {
		for (const timer of Object.values(timers)) {
			clearTimeout(timer);
		}
	});

	/** Reveal and copy post the same action; the step-up dialog steps in when it is due. */
	const valueSubmit: SubmitFunction = ({ formElement, submitter, formData, cancel }) => {
		const id = String(formData.get('id'));
		const purpose = String(formData.get('purpose'));
		if (purpose === 'reveal' && shown[id] !== undefined) {
			cancel();
			hide(id);
			return;
		}
		return async ({ result }) => {
			if (needsStepUp(result)) {
				if (await stepUp.request()) {
					formElement.requestSubmit(submitter);
				}
				return;
			}
			if (result.type === 'failure' && typeof result.data?.message === 'string') {
				notifications.fault(result.data.message);
				return;
			}
			if (result.type !== 'success' || typeof result.data?.value !== 'string') {
				notifications.fault(m.settings_error_generic());
				return;
			}
			if (purpose === 'copy') {
				await navigator.clipboard.writeText(result.data.value);
				notifications.confirm(m.vault_copied());
			} else {
				show(id, result.data.value);
			}
		};
	};

	function startEdit(secret: VaultSecretView): void {
		editing = secret;
		editOpen = true;
	}

	function startDelete(secret: VaultSecretView): void {
		deleting = secret;
		deleteOpen = true;
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
			await update();
		};
	};
</script>

<PageShell
	title={m.vault_title()}
	sigil={m.vault_sigil()}
	metaDescription={m.vault_meta_description()}
>
	{#snippet actions()}
		<button type="button" class="primary" onclick={() => (createOpen = true)}>
			{m.vault_new()}
		</button>
	{/snippet}
	{#if stepUpNeeded}
		<p class="step-up" role="alert">
			{m.step_up_required()}
			<a href="{localizedHref('/step-up')}?redirectTo={encodeURIComponent('/vault')}">
				{m.step_up_link()}
			</a>
		</p>
	{/if}
	{#if secrets.length === 0}
		<p class="empty">{m.vault_empty()}</p>
	{:else}
		<ul class="secrets" aria-label={m.vault_title()}>
			{#each secrets as secret (secret.id)}
				{@const value = valueOf(secret.id)}
				<li class="card">
					<div class="text">
						<p class="name">{secret.name}</p>
						{#if secret.serviceUrl}
							<a
								class="url"
								href={secret.serviceUrl}
								target="_blank"
								rel="external noopener noreferrer">{secret.serviceUrl}</a
							>
						{/if}
						{#if secret.description}
							<p class="description">{secret.description}</p>
						{/if}
						{#if secret.apiKeyId !== null}
							<p class="copy-of">{m.vault_api_key_copy()}</p>
						{/if}
						<p class="value" aria-live="polite">
							{#if value === null}
								<span class="mask" aria-label={m.vault_hidden()}>••••••••••••</span>
							{:else}
								<code>{value}</code>
							{/if}
						</p>
					</div>
					<div class="actions">
						<form method="POST" action="?/reveal" use:enhance={valueSubmit}>
							<input type="hidden" name="id" value={secret.id} />
							<input type="hidden" name="purpose" value="reveal" />
							<button
								type="submit"
								class="icon-button"
								aria-label={value === null
									? m.vault_reveal_named({ name: secret.name })
									: m.vault_hide_named({ name: secret.name })}
								title={value === null ? m.vault_reveal() : m.vault_hide()}
							>
								{#if value === null}
									<Eye size={17} />
								{:else}
									<EyeOff size={17} />
								{/if}
							</button>
						</form>
						<form method="POST" action="?/reveal" use:enhance={valueSubmit}>
							<input type="hidden" name="id" value={secret.id} />
							<input type="hidden" name="purpose" value="copy" />
							<button
								type="submit"
								class="icon-button"
								aria-label={m.vault_copy_named({ name: secret.name })}
								title={m.vault_copy()}
							>
								<Copy size={17} />
							</button>
						</form>
						<button
							type="button"
							class="icon-button"
							aria-label={m.vault_edit_named({ name: secret.name })}
							title={m.vault_edit()}
							onclick={() => startEdit(secret)}
						>
							<Pencil size={17} />
						</button>
						<button
							type="button"
							class="icon-button danger"
							aria-label={m.vault_delete_named({ name: secret.name })}
							title={m.common_delete()}
							onclick={() => startDelete(secret)}
						>
							<Trash2 size={17} />
						</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</PageShell>

<Dialog bind:open={createOpen} id="secretCreate" title={m.vault_new()}>
	<SecretForm
		secret={null}
		onsaved={(message) => {
			createOpen = false;
			notifications.confirm(message);
		}}
	/>
</Dialog>
<Dialog bind:open={editOpen} id="secretEdit" title={m.vault_edit()}>
	{#key editing?.id}
		<SecretForm
			secret={editing}
			onsaved={(message) => {
				editOpen = false;
				if (editing !== null) {
					hide(editing.id);
				}
				notifications.confirm(message);
			}}
		/>
	{/key}
</Dialog>
<ConfirmDialog
	bind:open={deleteOpen}
	id="secretDelete"
	title={m.vault_delete_title()}
	message={m.vault_delete_confirm({ name: deleting?.name ?? '' })}
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

	.step-up {
		margin-bottom: 1rem;
		font-size: 0.82rem;
		color: clr.$errorColor;

		> a {
			color: clr.$accentColor;
		}
	}

	.empty {
		font-size: 0.9rem;
		color: clr.$textMutedColor;
	}

	.secrets {
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

		> .text {
			display: flex;
			flex: 1;
			flex-direction: column;
			gap: 0.25rem;
			min-width: 0;

			> .name {
				font-size: 0.92rem;
				color: clr.$textPrimaryColor;
			}

			> .url {
				overflow: hidden;
				font-size: 0.74rem;
				color: clr.$textMutedColor;
				text-overflow: ellipsis;
				white-space: nowrap;
			}

			> .description {
				font-size: 0.78rem;
				color: clr.$textSecondaryColor;
			}

			> .copy-of {
				font-size: 0.72rem;
				color: clr.$textMutedColor;
			}

			> .value {
				min-height: 1.4rem;
				font-size: 0.84rem;

				> .mask {
					letter-spacing: 0.1em;
					color: clr.$textMutedColor;
				}

				> code {
					color: clr.$textPrimaryColor;
					overflow-wrap: anywhere;
				}
			}
		}

		> .actions {
			display: flex;
			flex: none;
			gap: 0.3rem;
		}
	}

	.icon-button {
		@include forms.framedToolButton;

		&.danger:hover:not(:disabled) {
			color: clr.$errorColor;
			@include forms.frostedBacking;
		}
	}

	@media (max-width: vars.$mobileMax) {
		.card {
			flex-wrap: wrap;

			> .actions {
				justify-content: flex-end;
				width: 100%;
				padding-top: 0.5rem;
				border-top: 1px solid clr.$borderMutedColor;
			}
		}
	}
</style>
