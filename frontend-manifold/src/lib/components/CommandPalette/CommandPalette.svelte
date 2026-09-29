<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { PathnameWithSearchOrHash } from '$app/types';
	import { MODULES } from '$lib/modules/registry';
	import { m } from '$lib/paraglide/messages.js';
	import { deLocalizeHref, getLocale, locales, type Locale } from '$lib/paraglide/runtime.js';
	import { getPalette } from '$lib/state/palette.svelte';
	import { getThemeState } from '$lib/state/theme.svelte';
	import type { SearchHit } from '$lib/types/search';
	import { postAction } from '$lib/utils/actions';
	import { localizedHref } from '$lib/utils/navigation';
	import Search from '@lucide/svelte/icons/search';
	import { tick } from 'svelte';

	type Section = 'go' | 'actions' | 'services' | 'results';

	interface Entry {
		id: string;
		section: Section;
		label: string;
		hint: string;
		run: () => void | Promise<void>;
	}

	/** Search needs this many characters, so a single key does not query the server. */
	const SEARCH_MIN_LENGTH = 2;
	const SEARCH_DELAY = 200;

	const SECTION_LABELS: Record<Section, () => string> = {
		go: m.palette_section_go,
		actions: m.palette_section_actions,
		services: m.palette_section_services,
		results: m.palette_section_results
	};

	const LOCALE_NAMES: Record<Locale, () => string> = {
		en: m.locale_name_en,
		tr: m.locale_name_tr
	};

	const TYPE_LABELS: Record<string, () => string> = {
		note: m.palette_type_note,
		service: m.palette_type_service,
		secret: m.palette_type_secret
	};

	const palette = getPalette();
	const theme = getThemeState();

	let dialog: HTMLDialogElement | undefined = $state();
	let input: HTMLInputElement | undefined = $state();
	let query = $state('');
	let active = $state(0);
	let hits = $state<SearchHit[]>([]);
	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	function close(): void {
		palette.open = false;
	}

	async function navigate(href: PathnameWithSearchOrHash): Promise<void> {
		close();
		await goto(localizedHref(href));
	}

	function openExternal(url: string): void {
		close();
		window.open(url, '_blank', 'noopener,noreferrer');
	}

	/** The theme switch's own form action stores the choice; the page follows at once. */
	async function toggleTheme(): Promise<void> {
		theme.syncFromDocument();
		const next = theme.current === 'dark' ? 'light' : 'dark';
		theme.apply(next);
		close();
		await postAction(localizedHref('/theme'), { theme: next, redirectTo: page.url.pathname });
	}

	/** Messages render once per page, so a new locale needs a full load, as in the locale switch. */
	function switchLocale(locale: Locale): void {
		const path = (deLocalizeHref(page.url.pathname) +
			page.url.search) as PathnameWithSearchOrHash;
		window.location.assign(localizedHref(path, locale));
	}

	function signOut(): void {
		const form = document.createElement('form');
		form.method = 'POST';
		form.action = localizedHref('/logout');
		document.body.append(form);
		form.submit();
	}

	function staticEntries(): Entry[] {
		const entries: Entry[] = [];
		for (const module of MODULES) {
			entries.push({
				id: `go.${module.id}`,
				section: 'go',
				label: m.palette_go({ place: module.label() }),
				hint: '',
				run: () => navigate(module.href)
			});
			for (const command of module.commands ?? []) {
				entries.push({
					id: command.id,
					section: 'go',
					label: command.label(),
					hint: module.label(),
					run: () => navigate(command.href)
				});
			}
		}
		const settings: [string, () => string, PathnameWithSearchOrHash][] = [
			['settings', m.nav_settings, '/settings'],
			['security', m.settings_section_security, '/settings/security'],
			['apiKeys', m.settings_section_api_keys, '/settings/api-keys']
		];
		for (const [id, label, href] of settings) {
			entries.push({
				id: `go.${id}`,
				section: 'go',
				label: m.palette_go({ place: label() }),
				hint: '',
				run: () => navigate(href)
			});
		}
		entries.push({
			id: 'action.theme',
			section: 'actions',
			label: m.palette_toggle_theme(),
			hint: '',
			run: toggleTheme
		});
		for (const locale of locales.filter((item) => item !== getLocale())) {
			entries.push({
				id: `action.locale.${locale}`,
				section: 'actions',
				label: m.palette_switch_locale({ language: LOCALE_NAMES[locale]() }),
				hint: '',
				run: () => switchLocale(locale)
			});
		}
		entries.push({
			id: 'action.signOut',
			section: 'actions',
			label: m.nav_logout(),
			hint: '',
			run: signOut
		});
		for (const item of page.data.sidebar?.services?.items ?? []) {
			if (item.link.kind === 'external') {
				const url = item.link.url;
				entries.push({
					id: `service.${item.id}`,
					section: 'services',
					label: item.label,
					hint: url,
					run: () => openExternal(url)
				});
			}
		}
		return entries;
	}

	const visible: Entry[] = $derived.by(() => {
		const needle = query.trim().toLocaleLowerCase();
		const matching = staticEntries().filter(
			(entry) =>
				needle.length === 0 ||
				entry.label.toLocaleLowerCase().includes(needle) ||
				entry.hint.toLocaleLowerCase().includes(needle)
		);
		const results: Entry[] = hits.map((hit) => ({
			id: `result.${hit.type}.${hit.id}`,
			section: 'results',
			label: hit.title,
			hint: hit.snippet || (TYPE_LABELS[hit.type]?.() ?? hit.type),
			run: () =>
				hit.external
					? openExternal(hit.href)
					: navigate(hit.href as PathnameWithSearchOrHash)
		}));
		return [...matching, ...results];
	});

	function onInput(): void {
		active = 0;
		clearTimeout(searchTimer);
		const current = query.trim();
		if (current.length < SEARCH_MIN_LENGTH) {
			hits = [];
			return;
		}
		searchTimer = setTimeout(async () => {
			const result = await postAction(`${localizedHref('/search')}?/search`, { q: current });
			if (query.trim() === current && result.type === 'success') {
				hits = (result.data?.hits ?? []) as SearchHit[];
			}
		}, SEARCH_DELAY);
	}

	function optionId(index: number): string {
		return `paletteOption${index}`;
	}

	async function scrollActiveIntoView(): Promise<void> {
		await tick();
		document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' });
	}

	function onKeydown(event: KeyboardEvent): void {
		const count = visible.length;
		if (event.key === 'ArrowDown' && count > 0) {
			event.preventDefault();
			active = (active + 1) % count;
			void scrollActiveIntoView();
		} else if (event.key === 'ArrowUp' && count > 0) {
			event.preventDefault();
			active = (active - 1 + count) % count;
			void scrollActiveIntoView();
		} else if (event.key === 'Home' && count > 0) {
			event.preventDefault();
			active = 0;
			void scrollActiveIntoView();
		} else if (event.key === 'End' && count > 0) {
			event.preventDefault();
			active = count - 1;
			void scrollActiveIntoView();
		} else if (event.key === 'Enter') {
			event.preventDefault();
			void visible[active]?.run();
		}
	}

	// The native dialog is driven through its DOM API; opening starts afresh.
	$effect(() => {
		if (dialog === undefined) {
			return;
		}
		if (palette.open && !dialog.open) {
			query = '';
			hits = [];
			active = 0;
			dialog.showModal();
			input?.focus();
		}
		if (!palette.open && dialog.open) {
			dialog.close();
		}
	});

	function isFirstOfSection(index: number): boolean {
		return index === 0 || visible[index - 1].section !== visible[index].section;
	}
</script>

<dialog
	bind:this={dialog}
	class="palette"
	aria-label={m.palette_title()}
	onclose={close}
	onclick={(event) => {
		if (event.target === dialog) {
			close();
		}
	}}
>
	<div class="sheet">
		<div class="field">
			<Search size={18} aria-hidden="true" />
			<input
				bind:this={input}
				bind:value={query}
				type="text"
				role="combobox"
				aria-label={m.palette_input()}
				aria-expanded="true"
				aria-controls="paletteList"
				aria-autocomplete="list"
				aria-activedescendant={visible.length > 0 ? optionId(active) : undefined}
				autocomplete="off"
				spellcheck="false"
				placeholder={m.palette_placeholder()}
				oninput={onInput}
				onkeydown={onKeydown}
			/>
			<kbd>Esc</kbd>
		</div>
		<ul id="paletteList" class="list" role="listbox" aria-label={m.palette_title()}>
			{#each visible as entry, index (entry.id)}
				{#if isFirstOfSection(index)}
					<li class="section" role="presentation">{SECTION_LABELS[entry.section]()}</li>
				{/if}
				<li
					id={optionId(index)}
					class="option"
					class:active={index === active}
					role="option"
					aria-selected={index === active}
					tabindex="-1"
					onmousemove={() => (active = index)}
					onclick={() => entry.run()}
					onkeydown={(event) => event.key === 'Enter' && entry.run()}
				>
					<span class="label">{entry.label}</span>
					{#if entry.hint}
						<span class="hint">{entry.hint}</span>
					{/if}
				</li>
			{/each}
		</ul>
		{#if visible.length === 0}
			<p class="empty">{m.palette_empty()}</p>
		{/if}
	</div>
</dialog>

<style lang="scss">
	@use '../../../styles/colors' as clr;
	@use '../../../styles/variables' as vars;

	.palette {
		width: min(40rem, calc(100vw - 2rem));
		max-width: none;
		max-height: min(34rem, calc(100dvh - 6rem));
		margin: 12vh auto auto;
		padding: 0;
		color: clr.$textPrimaryColor;
		background-color: clr.$panelColor;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radiusLarge;
		box-shadow: 0 20px 60px clr.$shadowColor;

		&::backdrop {
			background-color: clr.$scrimColor;
		}

		> .sheet {
			display: flex;
			flex-direction: column;
			max-height: inherit;
		}
	}

	.field {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		padding: 0 1rem;
		color: clr.$textMutedColor;
		border-bottom: 1px solid clr.$borderSubtleColor;

		> input {
			flex: 1;
			min-width: 0;
			min-height: 3.4rem;
			padding: 0;
			font: inherit;
			font-size: 0.95rem;
			color: clr.$textPrimaryColor;
			background: transparent;
			border: 0;
			outline: none;
		}

		> kbd {
			padding: 0.1rem 0.4rem;
			font: inherit;
			font-size: 0.64rem;
			border: 1px solid clr.$borderSubtleColor;
			border-radius: vars.$radius;
		}
	}

	.list {
		flex: 1;
		min-height: 0;
		margin: 0;
		padding: 0.4rem;
		overflow-y: auto;
		list-style: none;

		> .section {
			padding: 0.7rem 0.6rem 0.3rem;
			font-size: 0.62rem;
			letter-spacing: 0.18em;
			text-transform: uppercase;
			color: clr.$textMutedColor;
		}

		> .option {
			display: flex;
			flex-direction: column;
			justify-content: center;
			gap: 0.1rem;
			min-height: vars.$touchTarget;
			padding: 0.4rem 0.7rem;
			border-radius: vars.$radius;
			cursor: pointer;

			&.active {
				background-color: clr.$accentWashColor;

				> .label {
					color: clr.$accentColor;
				}
			}

			> .label {
				font-size: 0.88rem;
			}

			> .hint {
				overflow: hidden;
				font-size: 0.72rem;
				color: clr.$textMutedColor;
				text-overflow: ellipsis;
				white-space: nowrap;
			}
		}
	}

	.empty {
		padding: 1.2rem;
		font-size: 0.84rem;
		color: clr.$textMutedColor;
	}

	// Phones: the whole screen, above the keyboard.
	@media (max-width: vars.$mobileMax) {
		.palette {
			width: 100vw;
			height: 100dvh;
			max-height: none;
			margin: 0;
			border: 0;
			border-radius: 0;
		}

		.field {
			padding-top: env(safe-area-inset-top);

			> kbd {
				display: none;
			}
		}
	}
</style>
