<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import { getNotifications } from '$lib/state/notifications.svelte';
	import { getStepUp, needsStepUp } from '$lib/state/step-up.svelte';
	import type { SessionView } from '$lib/types/security';
	import { relativeTime } from '$lib/utils/time';
	import type { SubmitFunction } from '@sveltejs/kit';

	interface Props {
		sessions: SessionView[];
	}

	let { sessions }: Props = $props();

	const notifications = getNotifications();
	const stepUp = getStepUp();

	const others = $derived(sessions.filter((item) => !item.current).length);

	function device(item: SessionView): string {
		if (item.browser === null && item.os === null) {
			return m.security_device_unknown();
		}
		if (item.os === null) {
			return item.browser ?? '';
		}
		if (item.browser === null) {
			return item.os;
		}
		return m.security_device({ browser: item.browser, os: item.os });
	}

	/** Ending sessions is a sensitive action: without a recent step-up the dialog asks first. */
	const notifyResult: SubmitFunction = ({ formElement, submitter }) => {
		return async ({ result, update }) => {
			if (needsStepUp(result)) {
				if (await stepUp.request()) {
					formElement.requestSubmit(submitter);
				}
				return;
			}
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

<ul class="sessions" aria-label={m.security_sessions()}>
	{#each sessions as item (item.id)}
		<li class="card" class:current={item.current}>
			<div class="text">
				<p class="device">
					{device(item)}
					{#if item.current}
						<span class="marker">{m.security_session_current()}</span>
					{/if}
				</p>
				<dl>
					<div>
						<dt>{m.security_session_ip()}</dt>
						<dd>{item.ip ?? m.security_unknown()}</dd>
					</div>
					<div>
						<dt>{m.security_session_created()}</dt>
						<dd>
							<time datetime={item.createdAt.toISOString()}>
								{relativeTime(item.createdAt, getLocale())}
							</time>
						</dd>
					</div>
					<div>
						<dt>{m.security_session_active()}</dt>
						<dd>
							<time datetime={item.lastActiveAt.toISOString()}>
								{relativeTime(item.lastActiveAt, getLocale())}
							</time>
						</dd>
					</div>
				</dl>
			</div>
			{#if !item.current}
				<form method="POST" action="?/revokeSession" use:enhance={notifyResult}>
					<input type="hidden" name="id" value={item.id} />
					<button
						type="submit"
						aria-label={m.security_session_revoke_named({ device: device(item) })}
					>
						{m.security_session_revoke()}
					</button>
				</form>
			{/if}
		</li>
	{/each}
</ul>
{#if others > 0}
	<form method="POST" action="?/revokeOtherSessions" use:enhance={notifyResult} class="others">
		<button type="submit">{m.security_sessions_revoke_others()}</button>
	</form>
{/if}

<style lang="scss">
	@use '../../../styles/colors' as clr;
	@use '../../../styles/forms' as forms;
	@use '../../../styles/variables' as vars;

	.sessions {
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

		&.current {
			border-color: clr.$accentMutedColor;
		}

		> .text {
			display: flex;
			flex: 1;
			flex-direction: column;
			gap: 0.4rem;
			min-width: 0;

			> .device {
				display: flex;
				flex-wrap: wrap;
				align-items: center;
				gap: 0.6rem;
				font-size: 0.9rem;
				color: clr.$textPrimaryColor;

				> .marker {
					font-size: 0.62rem;
					letter-spacing: 0.16em;
					text-transform: uppercase;
					color: clr.$accentColor;
				}
			}

			> dl {
				display: flex;
				flex-wrap: wrap;
				gap: 0.2rem 1.4rem;
				margin: 0;

				> div {
					display: flex;
					gap: 0.4rem;
					font-size: 0.72rem;

					> dt {
						color: clr.$textMutedColor;
					}

					> dd {
						margin: 0;
						color: clr.$textSecondaryColor;
					}
				}
			}
		}

		> form > button {
			@include forms.quietButton;
			padding-inline: 0.5rem;

			&:hover:not(:disabled) {
				color: clr.$errorColor;
			}
		}
	}

	.others {
		margin-top: 1rem;

		> button {
			@include forms.primaryButton;
		}
	}

	@media (max-width: vars.$mobileMax) {
		.card {
			flex-wrap: wrap;

			> form {
				display: flex;
				justify-content: flex-end;
				width: 100%;
				padding-top: 0.4rem;
				border-top: 1px solid clr.$borderMutedColor;
			}
		}

		.others > button {
			width: 100%;
		}
	}
</style>
