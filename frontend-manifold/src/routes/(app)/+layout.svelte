<script lang="ts">
	import { page } from '$app/state';
	import HamburgerIcon from '$lib/components/icons/HamburgerIcon.svelte';
	import Sidebar from '$lib/components/Sidebar/Sidebar.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { getSidebarState } from '$lib/state/sidebar.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const sidebar = getSidebarState();
</script>

<div class="app">
	<Sidebar />
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
		</header>
		<div class="page">
			{@render children()}
		</div>
	</div>
</div>

<style lang="scss">
	@use '../../styles/colors' as clr;
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
				background-color: transparent;
				border: 1px solid clr.$accentMutedColor;
				border-radius: vars.$radius;
				cursor: pointer;

				&:hover {
					color: clr.$accentColor;
					border-color: clr.$accentColor;
				}
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
