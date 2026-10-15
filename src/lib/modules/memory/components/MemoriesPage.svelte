<script lang="ts">
	import PageShell from '$lib/components/PageShell/PageShell.svelte';
	import TagChip from '$lib/components/Tags/TagChip.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import type { Tag } from '$lib/types/tags';
	import { localizedHref } from '$lib/utils/navigation';
	import { relativeTime } from '$lib/utils/time';
	import Pin from '@lucide/svelte/icons/pin';
	import { categoryLabel } from '../categories';
	import type { MemoryCategory, MemoryCategoryNode, MemorySummary } from '../types';
	import CategorySelect from './CategorySelect.svelte';

	interface Props {
		memories: MemorySummary[];
		tree: MemoryCategoryNode[];
		categories: MemoryCategory[];
		tags: Tag[];
		filter: { q: string; category: string; tag: string; pinned: boolean };
	}

	let { memories, tree, categories, tags, filter }: Props = $props();

	const FILTER_DELAY = 300;

	let filterForm: HTMLFormElement | undefined = $state();
	let timer: ReturnType<typeof setTimeout> | undefined;
	let category = $derived(filter.category);

	const filtered = $derived(
		filter.q !== '' || filter.category !== '' || filter.tag !== '' || filter.pinned
	);

	function filterSoon(): void {
		clearTimeout(timer);
		timer = setTimeout(() => filterForm?.requestSubmit(), FILTER_DELAY);
	}

	function submitNow(): void {
		clearTimeout(timer);
		filterForm?.requestSubmit();
	}

	/** A new memory starts in the category being looked at. */
	const newHref = $derived.by(() => {
		if (filter.category === '' || filter.category === 'none') {
			return localizedHref('/memory/new');
		}
		return localizedHref(`/memory/new?category=${filter.category}`);
	});
</script>

<PageShell
	title={m.memory_module_title()}
	sigil={m.memory_sigil()}
	metaDescription={m.memory_meta_description()}
	description={m.memory_description()}
>
	{#snippet actions()}
		<a class="quiet" href={localizedHref('/memory/categories')}>{m.memory_categories_title()}</a
		>
		<a class="quiet" href={localizedHref('/memory/trash')}>{m.memory_trash_title()}</a>
		<a class="primary" href={newHref}>{m.memory_new()}</a>
	{/snippet}
	<form
		method="GET"
		class="filters"
		role="search"
		data-sveltekit-keepfocus
		data-sveltekit-replacestate
		bind:this={filterForm}
	>
		<label class="visually-hidden" for="memoryFilter">{m.memory_filter()}</label>
		<input
			id="memoryFilter"
			class="query"
			type="search"
			name="q"
			autocomplete="off"
			placeholder={m.memory_filter()}
			value={filter.q}
			oninput={filterSoon}
		/>
		<label class="visually-hidden" for="memoryCategoryFilter">{m.memory_category()}</label>
		<CategorySelect
			id="memoryCategoryFilter"
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
		<label class="check">
			<input
				type="checkbox"
				name="pinned"
				value="1"
				checked={filter.pinned}
				onchange={submitNow}
			/>
			<span>{m.memory_pinned_only()}</span>
		</label>
		<noscript><button type="submit" class="quiet">{m.memory_apply()}</button></noscript>
	</form>

	{#if tree.length > 0 && !filtered}
		<nav class="categories" aria-label={m.memory_categories_title()}>
			{#each tree as node (node.id)}
				<a href={localizedHref(`/memory?category=${node.id}`)}>
					<span>{node.name}</span>
					<span class="count"
						>{node.count +
							node.children.reduce((sum, child) => sum + child.count, 0)}</span
					>
				</a>
			{/each}
		</nav>
	{/if}

	{#if memories.length === 0}
		<p class="empty">{filtered ? m.memory_no_match() : m.memory_empty()}</p>
	{:else}
		<ul class="items" aria-label={m.memory_list_label()}>
			{#each memories as item (item.id)}
				<li class="row" class:pinned={item.pinned}>
					<a class="main" href={localizedHref(`/memory/${item.id}`)}>
						<span class="head">
							{#if item.pinned}
								<span class="pin" title={m.memory_pinned()}>
									<Pin size={14} aria-hidden="true" />
									<span class="visually-hidden">{m.memory_pinned()}</span>
								</span>
							{/if}
							<span class="title">{item.title}</span>
						</span>
						{#if item.excerpt !== ''}
							<span class="excerpt">{item.excerpt}</span>
						{/if}
						<span class="meta">
							{#if item.categoryId !== null}
								<span class="category"
									>{categoryLabel(categories, item.categoryId)}</span
								>
							{/if}
							<time datetime={item.updatedAt.toISOString()}>
								{relativeTime(item.updatedAt, getLocale())}
							</time>
						</span>
					</a>
					{#if item.tags.length > 0}
						<ul class="tags" aria-label={m.memory_tags()}>
							{#each item.tags as tag (tag.id)}
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
		margin-bottom: 1rem;

		> .query {
			@include forms.inputSurface;
			flex: 1 1 16rem;
		}

		> .select > select {
			@include forms.inputSurface;
			width: auto;
			padding-right: 2rem;
		}

		> .check {
			display: inline-flex;
			align-items: center;
			gap: 0.5rem;
			min-height: vars.$touchTarget;
			font-size: 0.82rem;
			color: clr.$textSecondaryColor;
			cursor: pointer;

			> input {
				width: 1.05rem;
				height: 1.05rem;
				accent-color: clr.$accentColor;
			}
		}
	}

	.categories {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-bottom: 1.2rem;

		> a {
			display: inline-flex;
			align-items: center;
			gap: 0.5rem;
			min-height: 2rem;
			padding: 0.2rem 0.7rem;
			font-size: 0.78rem;
			color: clr.$textSecondaryColor;
			text-decoration: none;
			border: 1px solid clr.$borderSubtleColor;
			border-radius: vars.$radius;
			transition:
				color 160ms ease,
				border-color 160ms ease;

			&:hover {
				color: clr.$accentColor;
				border-color: clr.$accentColor;
			}

			> .count {
				font-size: 0.68rem;
				color: clr.$textMutedColor;
			}
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

		&.pinned {
			border-left: 2px solid clr.$accentColor;
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
				align-items: center;
				gap: 0.4rem;
				min-width: 0;

				> .pin {
					display: inline-flex;
					flex: none;
					color: clr.$accentColor;
				}

				> .title {
					overflow: hidden;
					font-size: 0.95rem;
					color: clr.$textPrimaryColor;
					text-overflow: ellipsis;
					white-space: nowrap;
				}
			}

			> .excerpt {
				display: -webkit-box;
				overflow: hidden;
				font-size: 0.8rem;
				line-height: 1.5;
				color: clr.$textSecondaryColor;
				-webkit-line-clamp: 2;
				line-clamp: 2;
				-webkit-box-orient: vertical;
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
