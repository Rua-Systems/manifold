<script lang="ts">
	import CloseIcon from '$lib/components/icons/CloseIcon.svelte';
	import { getNotifications } from '$lib/state/notifications.svelte';
	import { NOTIFICATION_LABELS } from '$lib/types/notification';
	import { flip } from 'svelte/animate';
	import { cubicOut } from 'svelte/easing';
	import { fly } from 'svelte/transition';

	const store = getNotifications();
</script>

<div class="stack" aria-live="polite" aria-atomic="false">
	{#each store.items as item (item.id)}
		<div
			class="toast {item.kind}"
			animate:flip={{ duration: 220 }}
			transition:fly={{ x: 28, duration: 260, easing: cubicOut }}
		>
			<div class="text">
				<p class="label">++ {NOTIFICATION_LABELS[item.kind]} ++</p>
				<p class="message">{item.message}</p>
			</div>
			<button type="button" aria-label="Dismiss" onclick={() => store.dismiss(item.id)}>
				<CloseIcon size="0.9rem" />
			</button>
		</div>
	{/each}
</div>

<style lang="scss">
	@use '../../../styles/colors' as clr;
	@use '../../../styles/variables' as vars;

	.stack {
		position: fixed;
		right: clamp(0.9rem, 2.5vw, 1.5rem);
		bottom: clamp(0.9rem, 2.5vw, 1.5rem);
		z-index: 200;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		width: min(22rem, calc(100vw - 1.8rem));
		pointer-events: none;
	}

	.toast {
		display: flex;
		align-items: flex-start;
		gap: 0.8rem;
		padding: 0.85rem 0.9rem;
		background-color: clr.$panelColor;
		border: 1px solid clr.$borderSubtleColor;
		border-left: 2px solid clr.$textMutedColor;
		border-radius: vars.$radius;
		box-shadow: 0 12px 32px clr.$shadowColor;
		backdrop-filter: blur(12px);
		pointer-events: auto;

		> .text {
			flex: 1;
			min-width: 0;

			> .label {
				font-size: 0.6rem;
				letter-spacing: 0.26em;
				text-transform: uppercase;
				color: clr.$textMutedColor;
			}

			> .message {
				margin-top: 0.35rem;
				font-size: 0.78rem;
				line-height: 1.5;
				color: clr.$textSecondaryColor;
				overflow-wrap: anywhere;
			}
		}

		> button {
			flex: none;
			display: flex;
			align-items: center;
			justify-content: center;
			width: 1.4rem;
			height: 1.4rem;
			padding: 0;
			color: clr.$textMutedColor;
			background-color: transparent;
			border: 0;
			cursor: pointer;
			transition: color 160ms ease;

			&:hover {
				color: clr.$textPrimaryColor;
			}
		}

		&.confirm {
			border-left-color: clr.$accentColor;

			> .text > .label {
				color: clr.$accentColor;
			}
		}

		&.fault {
			border-left-color: clr.$errorColor;

			> .text > .label {
				color: clr.$errorColor;
			}
		}
	}
</style>
