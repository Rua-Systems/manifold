<script lang="ts">
	import PageShell from '$lib/components/PageShell/PageShell.svelte';
	import TagChip from '$lib/components/Tags/TagChip.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import type { Tag } from '$lib/types/tags';
	import { localizedHref } from '$lib/utils/navigation';
	import { categoryLabel } from '../../categories';
	import CategorySelect from '../../components/CategorySelect.svelte';
	import type { MemoryCategory } from '../../types';
	import type { Prompt } from '../types';

	interface Props {
		prompts: Prompt[];
		categories: MemoryCategory[];
		tags: Tag[];
		filter: { q: string; category: string; tag: string };
	}

	let { prompts, categories, tags, filter }: Props = $props();

	const FILTER_DELAY = 300;

	let filterForm: HTMLFormElement | undefined = $state();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let category = $derived(filter.category);

	const filtered = $derived(filter.q !== '' || filter.category !== '' || filter.tag !== '');

	function filterSoon(): void {
		clearTimeout(timer);
		timer = setTimeout(() => filterForm?.requestSubmit(), FILTER_DELAY);
	}

	function submitNow(): void {
		clearTimeout(timer);
		filterForm?.requestSubmit();
	}
</script>

<PageShell
	title={m.prompts_title()}
	sigil={m.memory_sigil()}
	metaDescription={m.prompts_meta_description()}
	description={m.prompts_description()}
>
	{#snippet actions()}
		<a class="quiet" href={localizedHref('/memory')}>{m.memory_all()}</a>
		<a class="primary" href={localizedHref('/memory/prompts/new')}>{m.prompts_new()}</a>
	{/snippet}
	<form
		method="GET"
		class="filters"
		role="search"
		data-sveltekit-keepfocus
		data-sveltekit-replacestate
		bind:this={filterForm}
	>
		<label class="visually-hidden" for="promptFilter">{m.prompts_filter()}</label>
		<input
			id="promptFilter"
			class="query"
			type="search"
			name="q"
			autocomplete="off"
			placeholder={m.prompts_filter()}
			value={filter.q}
			oninput={filterSoon}
		/>
		<label class="visually-hidden" for="promptCategoryFilter">{m.memory_category()}</label>
		<CategorySelect
			id="promptCategoryFilter"
			{categories}
			bind:value={category}
			emptyLabel={m.memory_category_all()}
			noneOption
			onchange={submitNow}
		/>
		<label class="select">
			<span class="visually-hidden">{m.memory_tag()}</span>
			<select name="tag" value={filter.tag} onchange={submitNow}>
				<option value="">{m.memory_tag_all()}</option>
				{#each tags as tag (tag.id)}
					<option value={tag.id}>{tag.name}</option>
				{/each}
			</select>
		</label>
		<noscript><button type="submit" class="quiet">{m.memory_apply()}</button></noscript>
	</form>

	{#if prompts.length === 0}
		<p class="empty">{filtered ? m.prompts_no_match() : m.prompts_empty()}</p>
	{:else}
		<ul class="items" aria-label={m.prompts_title()}>
			{#each prompts as prompt (prompt.id)}
				<li class="row">
					<a class="main" href={localizedHref(`/memory/prompts/${prompt.id}`)}>
						<span class="head">
							<span class="title">{prompt.title}</span>
							<code class="handle">/{prompt.name}</code>
						</span>
						{#if prompt.description !== ''}
							<span class="description">{prompt.description}</span>
						{/if}
						<span class="meta">
							{#if prompt.categoryId !== null}
								<span class="category"
									>{categoryLabel(categories, prompt.categoryId)}</span
								>
							{/if}
							{#if prompt.variables.length > 0}
								<span
									>{m.prompts_variables_list({
										names: prompt.variables.join(', ')
									})}</span
								>
							{/if}
						</span>
					</a>
					{#if prompt.tags.length > 0}
						<ul class="tags" aria-label={m.memory_tags()}>
							{#each prompt.tags as tag (tag.id)}
								<li><TagChip name={tag.name} color={tag.color} /></li>
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</PageShell>

<style lang="scss">
	@use '../../../../../styles/colors' as clr;
	@use '../../../../../styles/forms' as forms;
	@use '../../../../../styles/variables' as vars;

	.primary {
		@include forms.primaryButton;
		display: inline-flex;
		align-items: center;
		text-decoration: none;
	}

	.quiet {
		@include forms.framedButton;
		display: inline-flex;
		align-items: center;
		text-decoration: none;
	}

	.filters {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 1.2rem;

		> .query {
			@include forms.inputSurface;
			flex: 1 1 16rem;
		}

		> .select > select {
			@include forms.inputSurface;
			width: auto;
			padding-right: 2rem;
		}
	}

	.empty {
		font-size: 0.9rem;
		color: clr.$textMutedColor;
	}

	.items {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.row {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		padding: 0.7rem 0.9rem;
		background-color: clr.$surfaceColor;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radius;
		transition: border-color 160ms ease;

		&:hover {
			border-color: clr.$accentMutedColor;
		}

		> .main {
			display: flex;
			flex-direction: column;
			gap: 0.25rem;
			min-width: 0;
			color: inherit;
			text-decoration: none;

			> .head {
				display: flex;
				flex-wrap: wrap;
				align-items: baseline;
				gap: 0.2rem 0.7rem;
				min-width: 0;

				> .title {
					font-size: 0.95rem;
					color: clr.$textPrimaryColor;
				}

				> .handle {
					font-size: 0.72rem;
					color: clr.$accentColor;
				}
			}

			> .description {
				font-size: 0.8rem;
				line-height: 1.5;
				color: clr.$textSecondaryColor;
			}

			> .meta {
				display: flex;
				flex-wrap: wrap;
				gap: 0.2rem 0.8rem;
				font-size: 0.7rem;
				color: clr.$textMutedColor;

				> .category {
					letter-spacing: 0.1em;
					text-transform: uppercase;
					color: clr.$textSecondaryColor;
				}
			}
		}

		> .tags {
			display: flex;
			flex-wrap: wrap;
			gap: 0.3rem;
			margin: 0;
			padding: 0;
			list-style: none;
		}
	}
</style>
