<script lang="ts">
	import ConfirmDialog from '$lib/components/ConfirmDialog/ConfirmDialog.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import { getNotifications } from '$lib/state/notifications.svelte';
	import type { ApiKeyView } from '$lib/types/api-keys';
	import { relativeTime } from '$lib/utils/time';
	import type { SubmitFunction } from '@sveltejs/kit';

	interface Props {
		keys: ApiKeyView[];
		/** Ids of the keys with a copy in the vault, which revoking deletes. */
		copies: string[];
	}

	let { keys, copies }: Props = $props();

	const notifications = getNotifications();

	let revokeOpen = $state(false);
	let revoking = $state<ApiKeyView | null>(null);

	const dateFormat = $derived(
		new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium', timeZone: 'UTC' })
	);

	function status(key: ApiKeyView): 'active' | 'revoked' | 'expired' {
		if (key.revokedAt !== null) {
			return 'revoked';
		}
		if (key.expiresAt !== null && key.expiresAt <= new Date()) {
			return 'expired';
		}
		return 'active';
	}

	const STATUS_LABELS = {
		active: m.api_keys_status_active,
		revoked: m.api_keys_status_revoked,
		expired: m.api_keys_status_expired
	};

	function revokeMessage(key: ApiKeyView | null): string {
		if (key === null) {
			return '';
		}
		if (copies.includes(key.id)) {
			return m.api_keys_revoke_confirm_copy({ name: key.name });
		}
		return m.api_keys_revoke_confirm({ name: key.name });
	}

	function startRevoke(key: ApiKeyView): void {
		revoking = key;
		revokeOpen = true;
	}

	const revokeResult: SubmitFunction = () => {
		revokeOpen = false;
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

{#if keys.length === 0}
	<p class="empty">{m.api_keys_empty()}</p>
{:else}
	<ul class="keys" aria-label={m.api_keys_title()}>
		{#each keys as key (key.id)}
			{@const keyState = status(key)}
			<li class="card {keyState}">
				<div class="text">
					<p class="name">
						{key.name}
						<span class="state">{STATUS_LABELS[keyState]()}</span>
					</p>
					<p class="prefix"><code>mfd_{key.prefix}_…</code></p>
					<p class="scopes">
						{#each key.scopes as scope (scope)}
							<code>{scope}</code>
						{/each}
					</p>
					<p class="meta">
						{key.expiresAt === null
							? m.api_keys_no_expiry()
							: m.api_keys_expires_on({ date: dateFormat.format(key.expiresAt) })}
						·
						{key.lastUsedAt === null
							? m.api_keys_never_used()
							: m.api_keys_last_used({
									time: relativeTime(key.lastUsedAt, getLocale()),
									ip: key.lastUsedIp ?? m.security_unknown()
								})}
						{#if copies.includes(key.id)}
							· {m.api_keys_vault_copy()}
						{/if}
					</p>
				</div>
				{#if keyState === 'active'}
					<button
						type="button"
						class="revoke"
						aria-label={m.api_keys_revoke_named({ name: key.name })}
						onclick={() => startRevoke(key)}
					>
						{m.api_keys_revoke()}
					</button>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<ConfirmDialog
	bind:open={revokeOpen}
	id="apiKeyRevoke"
	title={m.api_keys_revoke_title()}
	message={revokeMessage(revoking)}
	action="?/revoke"
	fields={{ id: revoking?.id ?? '' }}
	confirmLabel={m.api_keys_revoke()}
	onresult={revokeResult}
/>

<style lang="scss">
	@use '../../../styles/colors' as clr;
	@use '../../../styles/forms' as forms;
	@use '../../../styles/variables' as vars;

	.empty {
		font-size: 0.86rem;
		color: clr.$textMutedColor;
	}

	.keys {
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

			> .prefix > code {
				font-size: 0.76rem;
				color: clr.$textSecondaryColor;
			}

			> .scopes {
				display: flex;
				flex-wrap: wrap;
				gap: 0.3rem;

				> code {
					padding: 0.1rem 0.4rem;
					font-size: 0.68rem;
					color: clr.$textSecondaryColor;
					border: 1px solid clr.$borderSubtleColor;
					border-radius: vars.$radius;
				}
			}

			> .meta {
				font-size: 0.72rem;
				color: clr.$textMutedColor;
			}
		}

		> .revoke {
			@include forms.quietButton;
			padding-inline: 0.5rem;

			&:hover:not(:disabled) {
				color: clr.$errorColor;
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

			> .revoke {
				justify-content: flex-end;
				width: 100%;
				padding-top: 0.4rem;
				border-top: 1px solid clr.$borderMutedColor;
			}
		}
	}
</style>
