<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import ChevronIcon from '$lib/components/icons/ChevronIcon.svelte';
	import type { Snippet } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { fly } from 'svelte/transition';

	interface Props {
		label: string;
		ariaLabel?: string;
		children: Snippet;
	}

	let { label, ariaLabel = '', children }: Props = $props();

	let isOpen = $state(false);
	let rootElement: HTMLDivElement | undefined = $state();
	let triggerElement: HTMLButtonElement | undefined = $state();

	afterNavigate(() => {
		isOpen = false;
	});

	function toggle(): void {
		isOpen = !isOpen;
	}

	function onWindowClick(event: MouseEvent): void {
		if (!isOpen) {
			return;
		}

		const target = event.target;
		if (target instanceof Node && rootElement?.contains(target) === true) {
			return;
		}
		isOpen = false;
	}

	function onWindowKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape' || !isOpen) {
			return;
		}

		isOpen = false;
		triggerElement?.focus();
	}
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKeydown} />

<div class="dropdown" bind:this={rootElement}>
	<button
		bind:this={triggerElement}
		type="button"
		class="trigger"
		class:open={isOpen}
		aria-haspopup="menu"
		aria-expanded={isOpen}
		aria-label={ariaLabel}
		onclick={toggle}
	>
		<span class="text">{label}</span>
		<span class="chevron">
			<ChevronIcon size="0.85rem" />
		</span>
	</button>
	{#if isOpen}
		<div
			class="panel"
			transition:fly={{ y: -6, duration: 180, easing: cubicOut }}
		>
			{@render children()}
		</div>
	{/if}
</div>

<style lang="scss">
	@use '../../../styles/colors' as clr;
	@use '../../../styles/variables' as vars;

	.dropdown {
		position: relative;
		display: inline-flex;
	}

	.trigger {
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.6rem 0.9rem;
		font-size: 0.7rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: clr.$textSecondaryColor;
		background-color: clr.$surfaceColor;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radius;
		cursor: pointer;
		transition:
			color 160ms ease,
			border-color 160ms ease,
			background-color 160ms ease;

		&:hover {
			color: clr.$textPrimaryColor;
			border-color: clr.$accentMutedColor;
		}

		&.open {
			color: clr.$accentColor;
			border-color: clr.$accentColor;
		}

		> .chevron {
			display: flex;
			transform: rotate(90deg);
			transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
		}

		&.open > .chevron {
			transform: rotate(-90deg);
		}
	}

	.panel {
		position: absolute;
		top: calc(100% + 0.4rem);
		right: 0;
		z-index: 40;
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 12rem;
		padding: 0.3rem;
		background-color: clr.$panelColor;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radius;
		box-shadow: 0 12px 32px clr.$shadowColor;
		backdrop-filter: blur(12px);

		> :global(a) {
			display: block;
			padding: 0.6rem 0.7rem;
			font-size: 0.82rem;
			color: clr.$textSecondaryColor;
			text-decoration: none;
			white-space: nowrap;
			border-radius: 2px;
			transition:
				color 160ms ease,
				background-color 160ms ease;
		}

		> :global(a:hover) {
			color: clr.$textPrimaryColor;
			background-color: clr.$surfaceHoverColor;
		}

		> :global(a[aria-current='page']) {
			color: clr.$accentColor;
		}
	}
</style>
