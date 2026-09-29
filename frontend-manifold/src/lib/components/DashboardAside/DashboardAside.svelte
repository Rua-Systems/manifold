<script lang="ts">
	import { page } from '$app/state';
	import ChevronIcon from '$lib/components/icons/ChevronIcon.svelte';
	import { DASHBOARD_ASIDE_LINKS } from '$lib/config/dashboard';
	import { m } from '$lib/paraglide/messages.js';
	import { getSidebarState } from '$lib/state/sidebar.svelte';
	import type { AsideLink } from '$lib/types/navigation';
	import { currentMarker, localizedHref } from '$lib/utils/navigation';

	interface AsideItem extends AsideLink {
		current: 'page' | undefined;
	}

	const sidebar = getSidebarState();

	const items: AsideItem[] = $derived(
		DASHBOARD_ASIDE_LINKS.map((link) => ({
			...link,
			current: currentMarker(page.url, link.href)
		}))
	);

	const toggleLabel = $derived.by(() => {
		if (sidebar.expanded) {
			return m.aside_collapse();
		}
		return m.aside_expand();
	});
</script>

<aside class="aside" class:expanded={sidebar.expanded}>
	<div class="aside-header">
		<button
			type="button"
			class="aside-button"
			aria-label={toggleLabel}
			aria-expanded={sidebar.expanded}
			aria-controls="dashboardAsideNav"
			onclick={() => sidebar.toggle()}
		>
			<span class="chevron">
				<ChevronIcon size="1.1rem" />
			</span>
		</button>
	</div>
	<nav id="dashboardAsideNav" class="aside-body" aria-label={m.aside_label()}>
		<ul>
			{#each items as item (item.href)}
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
</aside>

<style lang="scss">
	@use '../../../styles/colors' as clr;
	@use '../../../styles/variables' as vars;

	.aside {
		position: sticky;
		top: 0;
		align-self: flex-start;
		z-index: 20;
		display: flex;
		flex: none;
		flex-direction: column;
		gap: 1rem;
		width: 3.9rem;
		height: 100dvh;
		padding: clamp(0.9rem, 2.5vw, 1.4rem) 0.7rem;
		overflow: hidden;
		background-color: clr.$surfaceColor;
		border-right: 1px solid clr.$borderSubtleColor;
		transition: width 260ms cubic-bezier(0.22, 1, 0.36, 1);

		&.expanded {
			width: min(14rem, 72vw);
		}
	}

	.aside-header {
		display: flex;
		flex: none;
		justify-content: flex-end;
	}

	.aside-button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
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

	.aside.expanded .aside-button > .chevron {
		transform: rotate(180deg);
	}

	.aside-body {
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
				padding: 0.6rem 0.55rem;
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

	.aside.expanded .aside-body > ul > li > a > .label {
		opacity: 1;
	}
</style>
