<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import Credit from '$lib/components/Credit/Credit.svelte';
	import ChevronIcon from '$lib/components/icons/ChevronIcon.svelte';
	import CloseIcon from '$lib/components/icons/CloseIcon.svelte';
	import ManifoldLogo from '$lib/components/ManifoldLogo/ManifoldLogo.svelte';
	import { CORE_SIDEBAR_LINKS } from '$lib/config/navigation';
	import { m } from '$lib/paraglide/messages.js';
	import { getSidebarState } from '$lib/state/sidebar.svelte';
	import { currentMarker, localizedHref } from '$lib/utils/navigation';
	import { fade } from 'svelte/transition';

	const sidebar = getSidebarState();

	const organizationName = $derived(page.data.organizationName);

	const coreItems = $derived(
		CORE_SIDEBAR_LINKS.map((link) => ({ ...link, current: currentMarker(page.url, link.href) }))
	);

	const toggleLabel = $derived.by(() => {
		if (sidebar.expanded) {
			return m.sidebar_collapse();
		}
		return m.sidebar_expand();
	});

	afterNavigate(() => {
		sidebar.closeDrawer();
	});

	function onWindowKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape' && sidebar.drawerOpen) {
			sidebar.closeDrawer();
		}
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if sidebar.drawerOpen}
	<button
		type="button"
		class="backdrop"
		aria-label={m.sidebar_close()}
		onclick={() => sidebar.closeDrawer()}
		transition:fade={{ duration: 200 }}
	></button>
{/if}
<aside
	id="appSidebar"
	class="sidebar"
	class:expanded={sidebar.expanded}
	class:open={sidebar.drawerOpen}
>
	<div class="header">
		<p class="organization" title={organizationName}>{organizationName}</p>
		<button
			type="button"
			class="icon-button toggle"
			aria-label={toggleLabel}
			aria-expanded={sidebar.expanded}
			aria-controls="appSidebarNav"
			onclick={() => sidebar.toggle()}
		>
			<span class="chevron">
				<ChevronIcon size="1.1rem" />
			</span>
		</button>
		<button
			type="button"
			class="icon-button close"
			aria-label={m.sidebar_close()}
			onclick={() => sidebar.closeDrawer()}
		>
			<CloseIcon size="1.2rem" />
		</button>
	</div>
	<nav id="appSidebarNav" class="body" aria-label={m.sidebar_label()}>
		<ul>
			{#each coreItems as item (item.href)}
				{@const Icon = item.icon}
				<li>
					<a
						href={localizedHref(item.href)}
						class:active={item.current}
						aria-current={item.current}
						title={item.label()}
					>
						<span class="icon">
							<Icon />
						</span>
						<span class="label">{item.label()}</span>
					</a>
				</li>
			{/each}
		</ul>
	</nav>
	<div class="footer">
		<div class="credit">
			<Credit />
		</div>
		<span class="mark" aria-hidden="true">
			<ManifoldLogo />
		</span>
	</div>
</aside>

<style lang="scss">
	@use '../../../styles/colors' as clr;
	@use '../../../styles/variables' as vars;

	.backdrop {
		display: none;
	}

	.sidebar {
		position: sticky;
		top: 0;
		z-index: 30;
		display: flex;
		flex: none;
		flex-direction: column;
		gap: 1rem;
		width: 4.2rem;
		height: 100dvh;
		padding: calc(0.9rem + env(safe-area-inset-top)) 0.7rem
			calc(0.9rem + env(safe-area-inset-bottom)) calc(0.7rem + env(safe-area-inset-left));
		overflow: hidden;
		background-color: clr.$surfaceColor;
		border-right: 1px solid clr.$borderSubtleColor;
		transition: width 260ms cubic-bezier(0.22, 1, 0.36, 1);

		&.expanded {
			width: 15rem;
		}
	}

	.header {
		display: flex;
		flex: none;
		align-items: center;
		justify-content: flex-end;
		gap: 0.5rem;
		min-height: vars.$touchTarget;

		> .organization {
			display: none;
			flex: 1;
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

		> .close {
			display: none;
		}
	}

	.sidebar.expanded .header > .organization {
		display: block;
		padding-left: 0.55rem;
	}

	.icon-button {
		display: flex;
		flex: none;
		align-items: center;
		justify-content: center;
		width: vars.$touchTarget;
		height: vars.$touchTarget;
		padding: 0;
		color: clr.$textMutedColor;
		background-color: transparent;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radius;
		cursor: pointer;
		transition:
			color 160ms ease,
			border-color 160ms ease,
			background-color 160ms ease;

		&:hover {
			color: clr.$accentColor;
			border-color: clr.$accentColor;
			background-color: clr.$accentWashColor;
		}

		> .chevron {
			display: flex;
			transition: transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
		}
	}

	.sidebar.expanded .toggle > .chevron {
		transform: rotate(180deg);
	}

	.body {
		flex: 1;
		min-height: 0;
		overflow-x: hidden;
		overflow-y: auto;

		> ul {
			display: flex;
			flex-direction: column;
			gap: 0.2rem;
			margin: 0;
			padding: 0;
			list-style: none;

			> li > a {
				display: flex;
				align-items: center;
				gap: 0.8rem;
				min-height: vars.$touchTarget;
				padding: 0 0.7rem;
				color: clr.$textSecondaryColor;
				text-decoration: none;
				white-space: nowrap;
				border-left: 1px solid transparent;
				border-radius: vars.$radius;
				transition:
					color 160ms ease,
					background-color 160ms ease,
					border-color 160ms ease;

				&:hover {
					color: clr.$textPrimaryColor;
					background-color: clr.$surfaceHoverColor;
				}

				&.active {
					color: clr.$accentColor;
					border-left-color: clr.$accentColor;
					border-radius: 0 vars.$radius vars.$radius 0;
				}

				> .icon {
					display: flex;
					flex: none;
					align-items: center;
					justify-content: center;
					width: 1.35rem;
				}

				> .label {
					font-size: 0.85rem;
					letter-spacing: 0.02em;
					opacity: 0;
					transition: opacity 180ms ease;
				}
			}
		}
	}

	.sidebar.expanded .body > ul > li > a > .label {
		opacity: 1;
	}

	.footer {
		flex: none;
		padding: 0.9rem 0.55rem 0;
		border-top: 1px solid clr.$borderMutedColor;

		> .credit {
			display: none;
		}

		> .mark {
			display: block;
			width: 1.35rem;
			aspect-ratio: 500 / 434.9;
			color: clr.$textMutedColor;
		}
	}

	.sidebar.expanded .footer {
		> .credit {
			display: block;
		}

		> .mark {
			display: none;
		}
	}

	@media (max-width: vars.$mobileMax) {
		.backdrop {
			position: fixed;
			inset: 0;
			z-index: 140;
			display: block;
			padding: 0;
			background-color: clr.$scrimSoftColor;
			border: 0;
			backdrop-filter: blur(8px);
			cursor: default;
		}

		// On phones the sidebar is an off-canvas drawer that always shows its labels.
		.sidebar,
		.sidebar.expanded {
			position: fixed;
			top: 0;
			bottom: 0;
			left: 0;
			z-index: 150;
			width: min(18rem, 85vw);
			height: 100dvh;
			visibility: hidden;
			transform: translateX(-100%);
			box-shadow: 0 0 40px clr.$shadowColor;
			transition:
				transform 280ms cubic-bezier(0.22, 1, 0.36, 1),
				visibility 0s linear 280ms;
		}

		.sidebar.open {
			visibility: visible;
			transform: none;
			transition:
				transform 280ms cubic-bezier(0.22, 1, 0.36, 1),
				visibility 0s;
		}

		.header {
			> .organization {
				display: block;
				padding-left: 0.55rem;
			}

			> .toggle {
				display: none;
			}

			> .close {
				display: flex;
			}
		}

		.body > ul > li > a > .label {
			opacity: 1;
		}

		.footer {
			> .credit {
				display: block;
			}

			> .mark {
				display: none;
			}
		}
	}
</style>
