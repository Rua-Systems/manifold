<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import Credit from '$lib/components/Credit/Credit.svelte';
	import ChevronIcon from '$lib/components/icons/ChevronIcon.svelte';
	import CloseIcon from '$lib/components/icons/CloseIcon.svelte';
	import ManifoldLogo from '$lib/components/ManifoldLogo/ManifoldLogo.svelte';
	import { CORE_SIDEBAR_LINKS } from '$lib/config/navigation';
	import { MODULES } from '$lib/modules/registry';
	import type { ModuleManifest, SidebarData, SidebarItem } from '$lib/modules/types';
	import { m } from '$lib/paraglide/messages.js';
	import { deLocalizeHref } from '$lib/paraglide/runtime.js';
	import { getSidebarState } from '$lib/state/sidebar.svelte';
	import { currentMarker, localizedHref } from '$lib/utils/navigation';
	import { fade } from 'svelte/transition';

	interface Props {
		data: SidebarData;
	}

	let { data }: Props = $props();

	const MOBILE_QUERY = '(max-width: 767.98px)';

	const sidebar = getSidebarState();

	const organizationName = $derived(page.data.organizationName);
	const currentPath = $derived(deLocalizeHref(page.url.pathname));

	const toggleLabel = $derived.by(() => {
		if (sidebar.expanded) {
			return m.sidebar_collapse();
		}
		return m.sidebar_expand();
	});

	afterNavigate(() => {
		sidebar.closeDrawer();
	});

	function isRail(): boolean {
		return !sidebar.expanded && !window.matchMedia(MOBILE_QUERY).matches;
	}

	let filters = $state<Record<string, string>>({});

	function groupItems(module: ModuleManifest): SidebarItem[] {
		return data[module.id]?.items ?? [];
	}

	function isVisible(module: ModuleManifest, item: SidebarItem): boolean {
		const filter = (filters[module.id] ?? '').trim().toLocaleLowerCase();
		return (
			filter.length === 0 ||
			item.filterable !== true ||
			item.label.toLocaleLowerCase().includes(filter)
		);
	}

	function filterLabel(module: ModuleManifest): string | undefined {
		return data[module.id]?.filterLabel;
	}

	/** The filter field sits right before the first filterable item of the group. */
	function isFirstFilterable(module: ModuleManifest, item: SidebarItem): boolean {
		const first = (data[module.id]?.items ?? []).find((entry) => entry.filterable === true);
		return first?.id === item.id;
	}

	function isInModule(module: ModuleManifest): boolean {
		return currentPath === module.href || currentPath.startsWith(`${module.href}/`);
	}

	function onGroupClick(event: MouseEvent, module: ModuleManifest): void {
		if (module.sidebar !== 'group') {
			return;
		}
		// On the icon rail a group has nowhere to show its items, so the first click opens the
		// sidebar instead of leaving the page.
		if (isRail()) {
			event.preventDefault();
			sidebar.expand();
		}
		sidebar.openGroup(module.id);
	}

	function toggleGroupLabel(module: ModuleManifest): string {
		if (sidebar.isGroupOpen(module.id)) {
			return m.sidebar_group_collapse({ group: module.label() });
		}
		return m.sidebar_group_expand({ group: module.label() });
	}

	function onWindowKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape' && sidebar.drawerOpen) {
			sidebar.closeDrawer();
		}
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#snippet itemIcon(item: SidebarItem)}
	{#if item.icon?.kind === 'image'}
		<img class="item-icon" src={item.icon.src} alt="" loading="lazy" />
	{:else if item.icon?.kind === 'letter'}
		<span class="item-icon letter" aria-hidden="true">{item.icon.letter}</span>
	{:else}
		<span class="item-icon bullet" aria-hidden="true"></span>
	{/if}
{/snippet}

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
		<ul class="entries">
			{#each MODULES as module (module.id)}
				{@const Icon = module.icon}
				{@const open = sidebar.isGroupOpen(module.id)}
				<li class="entry" class:group={module.sidebar === 'group'}>
					<div class="entry-row">
						<a
							class="entry-link"
							class:active={isInModule(module)}
							href={localizedHref(module.href)}
							aria-current={currentMarker(page.url, module.href)}
							title={module.label()}
							onclick={(event) => onGroupClick(event, module)}
						>
							<span class="icon">
								<Icon />
							</span>
							<span class="label">{module.label()}</span>
						</a>
						{#if module.sidebar === 'group'}
							<button
								type="button"
								class="group-toggle"
								class:open
								aria-label={toggleGroupLabel(module)}
								aria-expanded={open}
								aria-controls="sidebarGroup-{module.id}"
								onclick={() => sidebar.toggleGroup(module.id)}
							>
								<ChevronIcon size="0.95rem" />
							</button>
						{/if}
					</div>
					{#if module.sidebar === 'group' && open}
						<ul class="children" id="sidebarGroup-{module.id}">
							{#each groupItems(module) as item (item.id)}
								{#if filterLabel(module) !== undefined && isFirstFilterable(module, item)}
									<li class="filter">
										<input
											type="search"
											aria-label={filterLabel(module)}
											placeholder={filterLabel(module)}
											bind:value={filters[module.id]}
										/>
									</li>
								{/if}
								{#if isVisible(module, item)}
									<li>
										{#if item.link.kind === 'external'}
											<a
												class="child"
												href={item.link.url}
												target="_blank"
												rel="external noopener noreferrer"
											>
												{@render itemIcon(item)}
												<span class="child-label">{item.label}</span>
											</a>
										{:else}
											<a
												class="child"
												class:active={currentPath === item.link.path}
												href={localizedHref(item.link.path)}
												aria-current={currentMarker(
													page.url,
													item.link.path
												)}
											>
												{@render itemIcon(item)}
												<span class="child-label">{item.label}</span>
											</a>
										{/if}
									</li>
								{/if}
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
			{#each CORE_SIDEBAR_LINKS as link (link.href)}
				{@const Icon = link.icon}
				<li class="entry">
					<div class="entry-row">
						<a
							class="entry-link"
							class:active={currentMarker(page.url, link.href) === 'page'}
							href={localizedHref(link.href)}
							aria-current={currentMarker(page.url, link.href)}
							title={link.label()}
						>
							<span class="icon">
								<Icon />
							</span>
							<span class="label">{link.label()}</span>
						</a>
					</div>
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
			width: 16rem;
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
	}

	.entries {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.entry-row {
		display: flex;
		align-items: center;
		gap: 0.2rem;
	}

	.entry-link {
		display: flex;
		flex: 1;
		align-items: center;
		gap: 0.8rem;
		min-width: 0;
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
			overflow: hidden;
			font-size: 0.85rem;
			letter-spacing: 0.02em;
			text-overflow: ellipsis;
			opacity: 0;
			transition: opacity 180ms ease;
		}
	}

	.group-toggle {
		display: none;
		flex: none;
		align-items: center;
		justify-content: center;
		width: vars.$touchTarget;
		height: vars.$touchTarget;
		padding: 0;
		color: clr.$textMutedColor;
		background-color: transparent;
		border: 0;
		border-radius: vars.$radius;
		cursor: pointer;
		transition:
			color 160ms ease,
			background-color 160ms ease;

		&:hover {
			color: clr.$textPrimaryColor;
			background-color: clr.$surfaceHoverColor;
		}

		:global(svg) {
			transform: rotate(90deg);
			transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
		}

		&.open :global(svg) {
			transform: rotate(-90deg);
		}
	}

	.children {
		display: none;
		flex-direction: column;
		gap: 0.1rem;
		margin: 0.1rem 0 0.4rem;
		padding: 0 0 0 1.3rem;
		list-style: none;
	}

	.child {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		min-height: vars.$touchTarget;
		padding: 0 0.6rem;
		font-size: 0.8rem;
		color: clr.$textSecondaryColor;
		text-decoration: none;
		white-space: nowrap;
		border-radius: vars.$radius;
		transition:
			color 160ms ease,
			background-color 160ms ease;

		&:hover {
			color: clr.$textPrimaryColor;
			background-color: clr.$surfaceHoverColor;
		}

		&.active {
			color: clr.$accentColor;
		}

		> .child-label {
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
		}
	}

	.filter > input {
		width: 100%;
		min-height: vars.$touchTarget;
		margin: 0.2rem 0;
		padding: 0 0.7rem;
		font: inherit;
		font-size: 0.78rem;
		color: clr.$textPrimaryColor;
		background-color: clr.$backgroundColor;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radius;

		&:focus {
			outline: none;
			border-color: clr.$accentColor;
		}
	}

	.item-icon {
		display: flex;
		flex: none;
		align-items: center;
		justify-content: center;
		width: 1.2rem;
		height: 1.2rem;
		object-fit: contain;
		border-radius: 3px;

		&.letter {
			font-size: 0.66rem;
			font-weight: 700;
			color: clr.$accentColor;
			background-color: clr.$accentWashColor;
			border: 1px solid clr.$accentMutedColor;
		}

		&.bullet::before {
			content: '';
			width: 0.3rem;
			height: 0.3rem;
			background-color: clr.$textMutedColor;
			border-radius: 50%;
		}
	}

	.sidebar.expanded {
		.entry-link > .label {
			opacity: 1;
		}

		.group-toggle {
			display: flex;
		}

		.children {
			display: flex;
		}
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

		.entry-link > .label {
			opacity: 1;
		}

		.group-toggle {
			display: flex;
		}

		.children {
			display: flex;
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
