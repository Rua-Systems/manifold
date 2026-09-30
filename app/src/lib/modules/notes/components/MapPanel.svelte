<script lang="ts">
	import CloseIcon from '$lib/components/icons/CloseIcon.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		onclose: () => void;
		/** Links or buttons next to the close button. */
		actions?: Snippet;
		children: Snippet;
	}

	let { title, onclose, actions, children }: Props = $props();

	/** Pixels the handle must travel before a drag changes the sheet's height. */
	const DRAG_THRESHOLD = 48;
	/** Less travel than this is a tap. */
	const TAP_DISTANCE = 6;

	let height = $state<'half' | 'full'>('half');
	let dragStart: number | null = null;
	let dragOffset = $state(0);

	function toggleHeight(): void {
		height = height === 'half' ? 'full' : 'half';
	}

	function onPointerDown(event: PointerEvent): void {
		dragStart = event.clientY;
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function onPointerMove(event: PointerEvent): void {
		if (dragStart !== null) {
			dragOffset = event.clientY - dragStart;
		}
	}

	/** Up grows the sheet, down shrinks it and then closes it; a tap toggles its height. */
	function onPointerUp(): void {
		if (dragStart === null) {
			return;
		}
		const offset = dragOffset;
		dragStart = null;
		dragOffset = 0;
		if (Math.abs(offset) < TAP_DISTANCE) {
			toggleHeight();
		} else if (offset <= -DRAG_THRESHOLD) {
			height = 'full';
		} else if (offset >= DRAG_THRESHOLD) {
			if (height === 'full') {
				height = 'half';
			} else {
				onclose();
			}
		}
	}
</script>

<aside
	class="panel {height}"
	class:dragging={dragOffset !== 0}
	aria-label={title}
	style:--drag="{dragOffset}px"
>
	<button
		type="button"
		class="handle"
		aria-label={height === 'half' ? m.map_panel_expand() : m.map_panel_shrink()}
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerUp}
		onclick={(event) => {
			// Pointers are handled on release; a click without one comes from a keyboard.
			if (event.detail === 0) {
				toggleHeight();
			}
		}}
	>
		<span class="grip" aria-hidden="true"></span>
	</button>
	<header class="head">
		<h2>{title}</h2>
		<div class="actions">
			{@render actions?.()}
			<button type="button" class="close" aria-label={m.common_close()} onclick={onclose}>
				<CloseIcon size="1.1rem" />
			</button>
		</div>
	</header>
	<div class="content">
		{@render children()}
	</div>
</aside>

<style lang="scss">
	@use '../../../../styles/colors' as clr;
	@use '../../../../styles/forms' as forms;
	@use '../../../../styles/variables' as vars;

	.panel {
		display: flex;
		flex: none;
		flex-direction: column;
		width: min(30rem, 42vw);
		min-height: 0;
		background-color: clr.$surfaceColor;
		border-left: 1px solid clr.$borderSubtleColor;

		> .handle {
			display: none;
		}

		> .head {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 0.8rem;
			// The account menu button is fixed in the top right corner above the panel.
			min-height: calc(#{vars.$touchTarget} + 2 * clamp(0.9rem, 2.5vw, 1.5rem));
			padding: 0.6rem calc(4.5rem + env(safe-area-inset-right)) 0.6rem 1.1rem;
			border-bottom: 1px solid clr.$borderSubtleColor;

			> h2 {
				font-size: 0.72rem;
				letter-spacing: 0.2em;
				text-transform: uppercase;
				color: clr.$textSecondaryColor;
			}

			> .actions {
				display: flex;
				align-items: center;
				gap: 0.4rem;
			}
		}

		> .content {
			flex: 1;
			min-height: 0;
			padding: 1rem 1.1rem 2rem;
			overflow-y: auto;
		}
	}

	.close {
		@include forms.toolButton;
	}

	// Phones: a sheet over the lower part of the map, above the toolbar, dragged by its handle
	// between half and full height.
	@media (max-width: vars.$mobileMax) {
		.panel {
			--toolbar: calc(#{vars.$mapToolbarHeight} + env(safe-area-inset-bottom));
			position: fixed;
			right: 0;
			bottom: var(--toolbar);
			left: 0;
			z-index: 30;
			width: auto;
			height: calc(50dvh - var(--drag));
			max-height: calc(100dvh - var(--toolbar) - 4.6rem);
			border-top: 1px solid clr.$borderSubtleColor;
			border-left: 0;
			border-radius: vars.$radiusLarge vars.$radiusLarge 0 0;
			box-shadow: 0 -10px 30px clr.$shadowColor;
			transition: height 200ms ease;

			&.full {
				height: calc(100dvh - var(--toolbar) - 4.6rem - var(--drag));
			}

			&.dragging {
				transition: none;
			}

			> .handle {
				display: flex;
				flex: none;
				align-items: center;
				justify-content: center;
				min-height: vars.$touchTarget;
				padding: 0;
				background-color: transparent;
				border: 0;
				cursor: grab;
				touch-action: none;

				> .grip {
					width: 2.6rem;
					height: 0.3rem;
					background-color: clr.$borderSubtleColor;
					border-radius: 1rem;
				}
			}

			> .head {
				min-height: 0;
				padding: 0 0.8rem 0.6rem 1.1rem;
			}
		}
	}
</style>
