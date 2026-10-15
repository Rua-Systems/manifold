<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import Credit from '$lib/components/Credit/Credit.svelte';
	import ChevronIcon from '$lib/components/icons/ChevronIcon.svelte';
	import CloseIcon from '$lib/components/icons/CloseIcon.svelte';
	import ManifoldLogo from '$lib/components/ManifoldLogo/ManifoldLogo.svelte';
	import { CORE_SIDEBAR_LINKS } from '$lib/config/navigation';
	import { MODULES } from '$lib/modules/registry';
	import type { Pathname } from '$app/types';
	import type { ModuleManifest, SidebarData, SidebarItem } from '$lib/modules/types';
	import { m } from '$lib/paraglide/messages.js';
	import { deLocalizeHref } from '$lib/paraglide/runtime.js';
	import { getPalette } from '$lib/state/palette.svelte';
	import { getSidebarState } from '$lib/state/sidebar.svelte';
	import FolderIcon from '@lucide/svelte/icons/folder';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import Search from '@lucide/svelte/icons/search';
	import type { SearchHit } from '$lib/types/search';
	import { postAction } from '$lib/utils/actions';
	import { currentMarker, localizedHref } from '$lib/utils/navigation';
	import {
		SIDEBAR_DEFAULT_WIDTH,
		SIDEBAR_MAX_WIDTH,
		SIDEBAR_MIN_WIDTH,
		SIDEBAR_WIDTH_STEP
	} from '$lib/utils/sidebar-width';
	import { fade } from 'svelte/transition';

	interface Props {
		data: SidebarData;
	}

	let { data }: Props = $props();

	const MOBILE_QUERY = '(max-width: 767.98px)';

	const sidebar = getSidebarState();
	const palette = getPalette();

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

	/** Waits this long after the last key before asking the search. */
	const SEARCH_DELAY = 200;

	let filters = $state<Record<string, string>>({});
	/** Search hits for groups whose filter asks the search, by module id. */
	let searched = $state<Record<string, SidebarItem[]>>({});
	// Not state: pending searches only.
	const searchTimers: Record<string, ReturnType<typeof setTimeout>> = {};

	interface GroupLayout {
		/** Items before the filterable ones, such as "New note". */
		before: SidebarItem[];
		/** The filterable items, narrowed by the filter or replaced by search hits. */
		middle: SidebarItem[];
		after: SidebarItem[];
		filterLabel: string | undefined;
	}

	function layoutOf(module: ModuleManifest): GroupLayout {
		const group = data[module.id];
		const items = group?.items ?? [];
		const first = items.findIndex((item) => item.filterable === true);
		if (first === -1) {
			return { before: items, middle: [], after: [], filterLabel: undefined };
		}
		const last = items.findLastIndex((item) => item.filterable === true);
		const query = (filters[module.id] ?? '').trim().toLocaleLowerCase();
		let middle = items.slice(first, last + 1);
		if (query.length > 0) {
			// Until the search answers, the listed items are narrowed right away, out of their
			// folders.
			middle =
				searched[module.id] ??
				leaves(middle).filter((item) => item.label.toLocaleLowerCase().includes(query));
		}
		return {
			before: items.slice(0, first),
			middle,
			after: items.slice(last + 1),
			filterLabel: group?.filterLabel
		};
	}

	function onFilterInput(module: ModuleManifest): void {
		const type = data[module.id]?.filterSearch;
		if (type === undefined) {
			return;
		}
		clearTimeout(searchTimers[module.id]);
		searched = Object.fromEntries(Object.entries(searched).filter(([id]) => id !== module.id));
		const query = (filters[module.id] ?? '').trim();
		if (query.length === 0) {
			return;
		}
		searchTimers[module.id] = setTimeout(async () => {
			const result = await postAction(`${localizedHref('/search')}?/search`, {
				q: query,
				types: type
			});
			// A newer query may have been typed meanwhile.
			if ((filters[module.id] ?? '').trim() !== query || result.type !== 'success') {
				return;
			}
			const hits = (result.data?.hits ?? []) as SearchHit[];
			searched = {
				...searched,
				[module.id]: hits.map((hit) => ({
					id: hit.id,
					label: hit.title,
					link: hit.external
						? { kind: 'external', url: hit.href }
						: { kind: 'internal', path: hit.href as Pathname },
					filterable: true
				}))
			};
		}, SEARCH_DELAY);
	}

	function isInModule(module: ModuleManifest): boolean {
		return currentPath === module.href || currentPath.startsWith(`${module.href}/`);
	}

	/** The filterable items that are not folders, from inside the folders too. */
	function leaves(items: SidebarItem[]): SidebarItem[] {
		return items.flatMap((item) => {
			if (item.children !== undefined) {
				return leaves(item.children);
			}
			if (item.filterable === true) {
				return [item];
			}
			return [];
		});
	}

	/** Folders opened or closed by hand; the others are open when they hold the current page. */
	let folderOpen = $state<Record<string, boolean>>({});

	function holdsCurrent(item: SidebarItem): boolean {
		return (item.children ?? []).some(
			(child) =>
				(child.link.kind === 'internal' && child.link.path === currentPath) ||
				holdsCurrent(child)
		);
	}

	function isFolderOpen(item: SidebarItem): boolean {
		return folderOpen[item.id] ?? holdsCurrent(item);
	}

	function toggleFolder(item: SidebarItem): void {
		folderOpen = { ...folderOpen, [item.id]: !isFolderOpen(item) };
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

	let aside: HTMLElement | undefined = $state();
	/**
	 * Where a drag of the edge started: the pointer, the width shown and the width kept at that
	 * moment.
	 */
	let dragStart: { x: number; width: number; kept: number | null } | null = null;
	/** Arrow keys save once they stop, not on every press. */
	const KEY_SAVE_DELAY = 400;
	let keySaveTimer: ReturnType<typeof setTimeout> | undefined;

	const shownWidth = $derived(sidebar.width ?? SIDEBAR_DEFAULT_WIDTH);

	function onResizeStart(event: PointerEvent): void {
		if (event.button !== 0 || aside === undefined) {
			return;
		}
		// No text selection while dragging, and the pointer stays with the edge beyond the sidebar.
		event.preventDefault();
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		dragStart = {
			x: event.clientX,
			width: aside.getBoundingClientRect().width,
			kept: sidebar.width
		};
		sidebar.resizing = true;
	}

	function onResizeMove(event: PointerEvent): void {
		if (dragStart === null) {
			return;
		}
		sidebar.setWidth(dragStart.width + event.clientX - dragStart.x);
	}

	function onResizeEnd(): void {
		if (dragStart === null) {
			return;
		}
		// A click without a move, such as each half of a double click, changes nothing to save.
		const changed = sidebar.width !== dragStart.kept;
		dragStart = null;
		sidebar.resizing = false;
		if (changed) {
			void sidebar.saveWidth();
		}
	}

	function onResizeKeydown(event: KeyboardEvent): void {
		let width: number;
		if (event.key === 'ArrowLeft') {
			width = shownWidth - SIDEBAR_WIDTH_STEP;
		} else if (event.key === 'ArrowRight') {
			width = shownWidth + SIDEBAR_WIDTH_STEP;
		} else if (event.key === 'Home') {
			width = SIDEBAR_MIN_WIDTH;
		} else if (event.key === 'End') {
			width = SIDEBAR_MAX_WIDTH;
		} else {
			return;
		}
		event.preventDefault();
		sidebar.setWidth(width);
		clearTimeout(keySaveTimer);
		keySaveTimer = setTimeout(() => void sidebar.saveWidth(), KEY_SAVE_DELAY);
	}

	function onResizeReset(): void {
		sidebar.resetWidth();
		void sidebar.saveWidth();
	}

	function onWindowKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape' && sidebar.drawerOpen) {
			sidebar.closeDrawer();
		}
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#snippet childItem(item: SidebarItem)}
	{#if item.children !== undefined}
		{@render folderItem(item, item.children)}
	{:else}
		{@render linkItem(item)}
	{/if}
{/snippet}

{#snippet folderItem(item: SidebarItem, children: SidebarItem[])}
	{@const open = isFolderOpen(item)}
	<li class="folder">
		<div class="folder-row">
			<button
				type="button"
				class="folder-toggle"
				class:open
				aria-expanded={open}
				aria-label={open
					? m.sidebar_folder_collapse({ folder: item.label })
					: m.sidebar_folder_expand({ folder: item.label })}
				onclick={() => toggleFolder(item)}
			>
				<ChevronIcon size="0.8rem" />
			</button>
			<a
				class="child"
				href={localizedHref(item.link.kind === 'internal' ? item.link.path : '/notes')}
			>
				<span class="item-icon" aria-hidden="true"><FolderIcon size="0.95rem" /></span>
				<span class="child-label">{item.label}</span>
			</a>
		</div>
		{#if open}
			<ul class="nested">
				{#each children as child (child.id)}
					{@render childItem(child)}
				{/each}
			</ul>
		{/if}
	</li>
{/snippet}

{#snippet linkItem(item: SidebarItem)}
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
				aria-current={currentMarker(page.url, item.link.path)}
			>
				{@render itemIcon(item)}
				<span class="child-label">{item.label}</span>
			</a>
		{/if}
	</li>
{/snippet}

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
	class:resizing={sidebar.resizing}
	style:--sidebarWidth={sidebar.width === null ? undefined : `${sidebar.width}px`}
	bind:this={aside}
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
			<li class="entry">
				<div class="entry-row">
					<button
						type="button"
						class="entry-link palette-button"
						title={m.palette_open()}
						aria-label={m.palette_open()}
						aria-haspopup="dialog"
						onclick={() => palette.show()}
					>
						<span class="icon">
							<Search size="1.2rem" />
						</span>
						<span class="label">
							{m.palette_search()}
							<kbd>Ctrl K</kbd>
						</span>
					</button>
				</div>
			</li>
			<li class="entry">
				<div class="entry-row">
					<a
						class="entry-link"
						class:active={currentMarker(page.url, '/dashboard') === 'page'}
						href={localizedHref('/dashboard')}
						aria-current={currentMarker(page.url, '/dashboard')}
						title={m.dashboard_title()}
					>
						<span class="icon">
							<LayoutDashboard size="1.2rem" />
						</span>
						<span class="label">{m.dashboard_title()}</span>
					</a>
				</div>
			</li>
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
						{@const layout = layoutOf(module)}
						<ul class="children" id="sidebarGroup-{module.id}">
							{#each layout.before as item (item.id)}
								{@render childItem(item)}
							{/each}
							{#if layout.filterLabel !== undefined}
								<li class="filter">
									<input
										type="search"
										aria-label={layout.filterLabel}
										placeholder={layout.filterLabel}
										bind:value={filters[module.id]}
										oninput={() => onFilterInput(module)}
									/>
								</li>
							{/if}
							{#each layout.middle as item (item.id)}
								{@render childItem(item)}
							{/each}
							{#each layout.after as item (item.id)}
								{@render childItem(item)}
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
	{#if sidebar.expanded}
		<!-- A focusable separator is the ARIA window splitter, a widget that moves with the arrow
			keys, Home and End; Svelte counts every separator as static. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
		<div
			class="resize"
			role="separator"
			tabindex="0"
			aria-label={m.sidebar_resize()}
			aria-controls="appSidebar"
			aria-orientation="vertical"
			aria-valuemin={SIDEBAR_MIN_WIDTH}
			aria-valuemax={SIDEBAR_MAX_WIDTH}
			aria-valuenow={shownWidth}
			title={m.sidebar_resize_hint()}
			onpointerdown={onResizeStart}
			onpointermove={onResizeMove}
			onpointerup={onResizeEnd}
			onpointercancel={onResizeEnd}
			onlostpointercapture={onResizeEnd}
			onkeydown={onResizeKeydown}
			ondblclick={onResizeReset}
		></div>
	{/if}
</aside>

<style lang="scss">
	@use '../../../styles/colors' as clr;
	@use '../../../styles/forms' as forms;
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
			width: var(--sidebarWidth, 16rem);
		}

		// The width follows the pointer while the edge is dragged.
		&.resizing {
			transition: none;
		}
	}

	.resize {
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		z-index: 2;
		width: 0.6rem;
		cursor: col-resize;
		touch-action: none;

		&::after {
			position: absolute;
			top: 0;
			right: -1px;
			bottom: 0;
			width: 2px;
			content: '';
			background-color: transparent;
			transition: background-color 160ms ease;
		}

		&:hover::after,
		&:focus-visible::after {
			background-color: clr.$accentColor;
		}

		&:focus-visible {
			outline: none;
		}
	}

	.sidebar.resizing > .resize::after {
		background-color: clr.$accentColor;
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
		@include forms.frostedBacking;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radius;
		cursor: pointer;
		transition:
			color 160ms ease,
			border-color 160ms ease;

		&:hover {
			color: clr.$accentColor;
			border-color: clr.$accentColor;
			@include forms.tint(clr.$accentWashColor);
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

	.palette-button {
		width: 100%;
		font: inherit;
		text-align: left;
		background-color: transparent;
		border-top: 0;
		border-right: 0;
		border-bottom: 0;
		cursor: pointer;

		> .label > kbd {
			margin-left: 0.6rem;
			padding: 0.05rem 0.35rem;
			font: inherit;
			font-size: 0.6rem;
			color: clr.$textMutedColor;
			border: 1px solid clr.$borderSubtleColor;
			border-radius: vars.$radius;
		}
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

	// A folder of a group: a toggle beside its link, and its items indented below it.
	.folder-row {
		display: flex;
		align-items: center;

		> .child {
			flex: 1;
			min-width: 0;
			padding-left: 0.2rem;
		}
	}

	.folder-toggle {
		display: flex;
		flex: none;
		align-items: center;
		justify-content: center;
		width: 1.6rem;
		height: vars.$touchTarget;
		margin-left: -0.4rem;
		padding: 0;
		color: clr.$textMutedColor;
		background: none;
		border: 0;
		border-radius: vars.$radius;
		cursor: pointer;

		&:hover {
			color: clr.$accentColor;
		}

		> :global(svg) {
			transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
		}

		&.open > :global(svg) {
			transform: rotate(90deg);
		}
	}

	.nested {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		margin: 0;
		padding: 0 0 0 0.9rem;
		list-style: none;
		border-left: 1px solid clr.$borderSubtleColor;
		margin-left: 0.4rem;
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
		// The drawer keeps its own width on phones.
		.resize {
			display: none;
		}

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
