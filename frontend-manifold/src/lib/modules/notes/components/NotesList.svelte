<script lang="ts">
	import PageShell from '$lib/components/PageShell/PageShell.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import { localizedHref } from '$lib/utils/navigation';
	import { relativeTime } from '$lib/utils/time';
	import type { NoteSummary } from '../types';

	interface Props {
		notes: NoteSummary[];
		query: string;
	}

	let { notes, query }: Props = $props();

	const FILTER_DELAY = 300;

	let filterForm: HTMLFormElement | undefined = $state();
	let timer: ReturnType<typeof setTimeout> | undefined;

	function filterSoon(): void {
		clearTimeout(timer);
		timer = setTimeout(() => filterForm?.requestSubmit(), FILTER_DELAY);
	}
</script>

<PageShell
	title={m.notes_title()}
	sigil={m.notes_sigil()}
	metaDescription={m.notes_meta_description()}
>
	{#snippet actions()}
		<a class="quiet" href={localizedHref('/notes/trash')}>{m.notes_trash_title()}</a>
		<a class="primary" href={localizedHref('/notes/new')}>{m.notes_new()}</a>
	{/snippet}
	<form
		method="GET"
		class="filter"
		role="search"
		data-sveltekit-keepfocus
		data-sveltekit-replacestate
		bind:this={filterForm}
	>
		<label class="visually-hidden" for="notesFilter">{m.notes_filter()}</label>
		<input
			id="notesFilter"
			type="search"
			name="q"
			autocomplete="off"
			placeholder={m.notes_filter()}
			value={query}
			oninput={filterSoon}
		/>
	</form>
	{#if notes.length === 0}
		<p class="empty">{query ? m.notes_no_match() : m.notes_empty()}</p>
	{:else}
		<ol class="list" aria-label={m.notes_title()}>
			{#each notes as item (item.id)}
				<li>
					<a href={localizedHref(`/notes/${item.id}`)}>
						<span class="title">{item.title || m.notes_untitled()}</span>
						{#if item.excerpt}
							<span class="excerpt">{item.excerpt}</span>
						{/if}
						<time datetime={item.updatedAt.toISOString()}>
							{m.notes_updated({ time: relativeTime(item.updatedAt, getLocale()) })}
						</time>
					</a>
				</li>
			{/each}
		</ol>
	{/if}
</PageShell>

<style lang="scss">
	@use '../../../../styles/colors' as clr;
	@use '../../../../styles/forms' as forms;
	@use '../../../../styles/variables' as vars;

	.primary {
		@include forms.primaryButton;
		display: inline-flex;
		align-items: center;
		text-decoration: none;
	}

	.quiet {
		@include forms.mutedLink;
	}

	.filter {
		margin-bottom: 1.2rem;

		> input {
			@include forms.inputSurface;
		}
	}

	.empty {
		font-size: 0.9rem;
		color: clr.$textMutedColor;
	}

	.list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;

		> li > a {
			display: flex;
			flex-direction: column;
			gap: 0.25rem;
			padding: 0.8rem 0.9rem;
			text-decoration: none;
			background-color: clr.$surfaceColor;
			border: 1px solid clr.$borderSubtleColor;
			border-radius: vars.$radius;
			transition:
				border-color 160ms ease,
				background-color 160ms ease;

			&:hover {
				border-color: clr.$accentMutedColor;
				background-color: clr.$surfaceHoverColor;
			}

			> .title {
				overflow: hidden;
				font-size: 0.95rem;
				color: clr.$textPrimaryColor;
				text-overflow: ellipsis;
				white-space: nowrap;
			}

			> .excerpt {
				display: -webkit-box;
				overflow: hidden;
				font-size: 0.8rem;
				line-height: 1.55;
				color: clr.$textSecondaryColor;
				-webkit-box-orient: vertical;
				-webkit-line-clamp: 2;
				line-clamp: 2;
			}

			> time {
				font-size: 0.68rem;
				letter-spacing: 0.08em;
				color: clr.$textMutedColor;
			}
		}
	}
</style>
