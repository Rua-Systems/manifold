<script lang="ts">
	import { page } from '$app/state';
	import HamburgerIcon from '$lib/components/icons/HamburgerIcon.svelte';
	import CommandPalette from '$lib/components/CommandPalette/CommandPalette.svelte';
	import Sidebar from '$lib/components/Sidebar/Sidebar.svelte';
	import StepUpDialog from '$lib/components/StepUp/StepUpDialog.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { setPalette } from '$lib/state/palette.svelte';
	import { setSidebarState } from '$lib/state/sidebar.svelte';
	import { setStepUp } from '$lib/state/step-up.svelte';
	import Search from '@lucide/svelte/icons/search';
	import { untrack } from 'svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const sidebar = setSidebarState(untrack(() => data.sidebarPreferences));
	setStepUp();
	const palette = setPalette();

	/** Ctrl+K, or Cmd+K on a Mac, opens the command palette from anywhere. */
	function onKeydown(event: KeyboardEvent): void {
		if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			palette.show();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="app">
	<Sidebar data={data.sidebar} />
	<div class="content">
		<header class="topbar">
			<button
				type="button"
				class="menu"
				aria-label={m.sidebar_open()}
				aria-expanded={sidebar.drawerOpen}
				aria-controls="appSidebar"
				onclick={() => sidebar.openDrawer()}
			>
				<HamburgerIcon />
			</button>
			<p class="organization">{page.data.organizationName}</p>
			<button
				type="button"
				class="menu search"
				aria-label={m.palette_open()}
				aria-haspopup="dialog"
				onclick={() => palette.show()}
			>
				<Search size={19} />
			</button>
		</header>
		<div class="page">
			{@render children()}
		</div>
	</div>
</div>
<StepUpDialog />
<CommandPalette />

<style lang="scss">
	@use '../../styles/colors' as clr;
	@use '../../styles/forms' as forms;
	@use '../../styles/variables' as vars;

	.app {
		display: flex;
		flex: 1;
		min-width: 0;
		min-height: 100dvh;
	}

	.content {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;

		> .page {
			display: flex;
			flex: 1;
			flex-direction: column;
			min-width: 0;
		}
	}

	.topbar {
		display: none;
	}

	@media (max-width: vars.$mobileMax) {
		.topbar {
			position: sticky;
			top: 0;
			z-index: 20;
			display: flex;
			align-items: center;
			gap: 0.8rem;
			// The account menu button sits fixed in the top right corner, so leave room for it.
			padding: calc(0.9rem + env(safe-area-inset-top))
				calc(4.5rem + env(safe-area-inset-right)) 0.9rem
				calc(0.9rem + env(safe-area-inset-left));
			background-color: clr.$surfaceTranslucentColor;
			border-bottom: 1px solid clr.$borderSubtleColor;
			backdrop-filter: blur(10px);

			> .menu {
				display: flex;
				flex: none;
				align-items: center;
				justify-content: center;
				width: vars.$touchTarget;
				height: vars.$touchTarget;
				padding: 0;
				color: clr.$textPrimaryColor;
				@include forms.frostedBacking;
				border: 1px solid clr.$accentMutedColor;
				border-radius: vars.$radius;
				cursor: pointer;

				&:hover {
					color: clr.$accentColor;
					border-color: clr.$accentColor;
				}
			}

			> .search {
				order: 3;
				margin-left: auto;
			}

			> .organization {
				min-width: 0;
				overflow: hidden;
				font-size: 0.72rem;
				font-weight: 700;
				letter-spacing: 0.2em;
				text-transform: uppercase;
				text-overflow: ellipsis;
				white-space: nowrap;
				color: clr.$textPrimaryColor;
			}
		}
	}
</style>
