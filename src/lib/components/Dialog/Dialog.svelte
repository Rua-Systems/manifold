<script lang="ts">
	import CloseIcon from '$lib/components/icons/CloseIcon.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import type { Snippet } from 'svelte';

	interface Props {
		open: boolean;
		title: string;
		/** Unique per page, used to label the dialog. */
		id: string;
		children: Snippet;
	}

	let { open = $bindable(false), title, id, children }: Props = $props();

	let dialog: HTMLDialogElement | undefined = $state();

	// The native dialog is driven through its DOM API; this mirrors `open` onto it.
	$effect(() => {
		if (dialog === undefined) {
			return;
		}
		if (open && !dialog.open) {
			dialog.showModal();
		}
		if (!open && dialog.open) {
			dialog.close();
		}
	});

	function onBackdropClick(event: MouseEvent): void {
		if (event.target === dialog) {
			open = false;
		}
	}
</script>

<dialog
	bind:this={dialog}
	class="dialog"
	aria-labelledby="{id}Title"
	onclose={() => (open = false)}
	onclick={onBackdropClick}
>
	<div class="sheet">
		<header class="head">
			<h2 id="{id}Title">{title}</h2>
			<button
				type="button"
				class="close"
				aria-label={m.common_close()}
				onclick={() => (open = false)}
			>
				<CloseIcon size="1.2rem" />
			</button>
		</header>
		<div class="content">
			{#if open}
				{@render children()}
			{/if}
		</div>
	</div>
</dialog>

<style lang="scss">
	@use '../../../styles/colors' as clr;
	@use '../../../styles/forms' as forms;
	@use '../../../styles/variables' as vars;

	.dialog {
		width: min(32rem, calc(100vw - 2rem));
		max-height: calc(100dvh - 3rem);
		padding: 0;
		color: clr.$textPrimaryColor;
		background-color: clr.$surfaceColor;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radiusLarge;
		box-shadow: 0 24px 60px clr.$shadowColor;

		&::backdrop {
			background-color: clr.$scrimColor;
			backdrop-filter: blur(6px);
		}
	}

	.sheet {
		display: flex;
		flex-direction: column;
		max-height: inherit;
	}

	.head {
		display: flex;
		flex: none;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.9rem 0.9rem 0.9rem 1.4rem;
		border-bottom: 1px solid clr.$borderMutedColor;

		> h2 {
			min-width: 0;
			font-size: 0.78rem;
			letter-spacing: 0.2em;
			text-transform: uppercase;
			color: clr.$accentColor;
		}

		> .close {
			display: flex;
			flex: none;
			align-items: center;
			justify-content: center;
			width: vars.$touchTarget;
			height: vars.$touchTarget;
			padding: 0;
			color: clr.$textMutedColor;
			@include forms.frostedBacking;
			border: 1px solid clr.$borderSubtleColor;
			border-radius: vars.$radius;
			cursor: pointer;

			&:hover {
				color: clr.$accentColor;
				border-color: clr.$accentColor;
			}
		}
	}

	.content {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 1.4rem;
	}

	// Phones get a full-screen sheet instead of a floating panel.
	@media (max-width: vars.$mobileMax) {
		.dialog {
			width: 100vw;
			max-width: 100vw;
			height: 100dvh;
			max-height: 100dvh;
			margin: 0;
			border: 0;
			border-radius: 0;
		}

		.sheet {
			height: 100%;
		}

		.head {
			padding-top: calc(0.9rem + env(safe-area-inset-top));
		}

		.content {
			padding-bottom: calc(1.4rem + env(safe-area-inset-bottom));
		}
	}
</style>
