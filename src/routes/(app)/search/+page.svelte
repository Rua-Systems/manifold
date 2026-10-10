<script lang="ts">
	import type { PathnameWithSearchOrHash } from '$app/types';
	import PageShell from '$lib/components/PageShell/PageShell.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { localizedHref } from '$lib/utils/navigation';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const TYPE_LABELS: Record<string, () => string> = {
		note: m.palette_type_note,
		service: m.palette_type_service,
		secret: m.palette_type_secret,
		file: m.palette_type_file
	};
</script>

<PageShell
	title={m.palette_search()}
	sigil={m.search_sigil()}
	metaDescription={m.search_meta_description()}
>
	<form method="GET" class="search" role="search" data-sveltekit-keepfocus>
		<label class="visually-hidden" for="searchQuery">{m.palette_input()}</label>
		<input
			id="searchQuery"
			type="search"
			name="q"
			autocomplete="off"
			placeholder={m.palette_placeholder()}
			value={data.query}
		/>
		<button type="submit">{m.palette_search()}</button>
	</form>
	{#if data.query.length > 0 && data.hits.length === 0}
		<p class="empty">{m.palette_empty()}</p>
	{:else if data.hits.length > 0}
		<ol class="hits" aria-label={m.palette_section_results()}>
			{#each data.hits as hit (`${hit.type}.${hit.id}`)}
				<li>
					{#if hit.external}
						<a href={hit.href} target="_blank" rel="external noopener noreferrer"
							>{hit.title}</a
						>
					{:else}
						<a href={localizedHref(hit.href as PathnameWithSearchOrHash)}>{hit.title}</a
						>
					{/if}
					<span class="type">{TYPE_LABELS[hit.type]?.() ?? hit.type}</span>
					{#if hit.snippet}
						<p class="snippet">{hit.snippet}</p>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}
</PageShell>

<style lang="scss">
	@use '../../../styles/colors' as clr;
	@use '../../../styles/forms' as forms;
	@use '../../../styles/variables' as vars;

	.search {
		display: flex;
		gap: 0.6rem;
		margin-bottom: 1.4rem;

		> input {
			@include forms.inputSurface;
			flex: 1;
		}

		> button {
			@include forms.primaryButton;
		}
	}

	.empty {
		font-size: 0.9rem;
		color: clr.$textMutedColor;
	}

	.hits {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;

		> li {
			display: flex;
			flex-wrap: wrap;
			align-items: baseline;
			gap: 0.2rem 0.8rem;
			padding: 0.7rem 0.9rem;
			background-color: clr.$surfaceColor;
			border: 1px solid clr.$borderSubtleColor;
			border-radius: vars.$radius;

			> a {
				font-size: 0.92rem;
				color: clr.$textPrimaryColor;
				text-decoration: none;

				&:hover {
					color: clr.$accentColor;
				}
			}

			> .type {
				font-size: 0.62rem;
				letter-spacing: 0.16em;
				text-transform: uppercase;
				color: clr.$textMutedColor;
			}

			> .snippet {
				flex-basis: 100%;
				font-size: 0.8rem;
				color: clr.$textSecondaryColor;
			}
		}
	}

	@media (max-width: vars.$mobileMax) {
		.search {
			flex-direction: column;
		}
	}
</style>
