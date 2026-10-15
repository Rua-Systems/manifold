<script lang="ts">
	import { enhance } from '$app/forms';
	import PageShell from '$lib/components/PageShell/PageShell.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { getNotifications } from '$lib/state/notifications.svelte';
	import { localizedHref } from '$lib/utils/navigation';
	import RefreshIcon from '@lucide/svelte/icons/refresh-cw';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { summaryOf, TYPE_LABELS } from '../labels';
	import { DATA_SOURCE_TYPES, type DataSourceType, type DataSourceView } from '../types';
	import TestStatus from './TestStatus.svelte';
	import TypeIcon from './TypeIcon.svelte';

	interface Props {
		sources: DataSourceView[];
		filter: { type: DataSourceType | null; query: string };
	}

	let { sources, filter }: Props = $props();

	const FILTER_DELAY = 300;

	const notifications = getNotifications();

	let filterForm: HTMLFormElement | undefined = $state();
	let timer: ReturnType<typeof setTimeout> | undefined;
	/** The sources being tested now, by id. */
	let testing = $state<Record<string, boolean>>({});

	const filtered = $derived(filter.type !== null || filter.query !== '');

	function filterSoon(): void {
		clearTimeout(timer);
		timer = setTimeout(() => filterForm?.requestSubmit(), FILTER_DELAY);
	}

	const testSubmit: SubmitFunction = ({ formData }) => {
		const id = String(formData.get('id'));
		testing = { ...testing, [id]: true };
		return async ({ result, update }) => {
			testing = { ...testing, [id]: false };
			if (result.type === 'success' && typeof result.data?.message === 'string') {
				if (result.data.success === true) {
					notifications.confirm(
						m.datasources_test_ok_message({ found: result.data.message })
					);
				} else {
					notifications.fault(
						m.datasources_test_failed_message({ reason: result.data.message })
					);
				}
			}
			await update({ reset: false });
		};
	};
</script>

<PageShell
	title={m.datasources_title()}
	sigil={m.datasources_sigil()}
	metaDescription={m.datasources_meta_description()}
>
	{#snippet actions()}
		<a class="primary" href={localizedHref('/data-sources/new')}>{m.datasources_new()}</a>
	{/snippet}
	<form
		method="GET"
		class="filters"
		role="search"
		data-sveltekit-keepfocus
		data-sveltekit-replacestate
		bind:this={filterForm}
	>
		<label class="visually-hidden" for="dataSourcesFilter">{m.datasources_filter()}</label>
		<input
			id="dataSourcesFilter"
			class="query"
			type="search"
			name="q"
			autocomplete="off"
			placeholder={m.datasources_filter()}
			value={filter.query}
			oninput={filterSoon}
		/>
		<label class="select">
			<span class="visually-hidden">{m.datasources_type()}</span>
			<select
				name="type"
				value={filter.type ?? ''}
				onchange={() => filterForm?.requestSubmit()}
			>
				<option value="">{m.datasources_type_all()}</option>
				{#each DATA_SOURCE_TYPES as type (type)}
					<option value={type}>{TYPE_LABELS[type]()}</option>
				{/each}
			</select>
		</label>
		<noscript><button type="submit" class="quiet">{m.datasources_apply()}</button></noscript>
	</form>

	{#if sources.length === 0}
		<p class="empty">{filtered ? m.datasources_no_match() : m.datasources_empty()}</p>
	{:else}
		<ul class="items" aria-label={m.datasources_title()}>
			{#each sources as source (source.id)}
				<li class="row">
					<a class="main" href={localizedHref(`/data-sources/${source.id}`)}>
						<span class="box" aria-hidden="true"><TypeIcon type={source.type} /></span>
						<span class="text">
							<span class="name">{source.name}</span>
							<span class="meta">
								<span class="kind">{TYPE_LABELS[source.type]()}</span>
								<span class="where">{summaryOf(source)}</span>
							</span>
							<TestStatus test={source.lastTest} />
						</span>
					</a>
					<form method="POST" action="?/test" use:enhance={testSubmit}>
						<input type="hidden" name="id" value={source.id} />
						<button
							type="submit"
							class="tool"
							class:spinning={testing[source.id] === true}
							disabled={testing[source.id] === true}
							aria-label={m.datasources_test_named({ name: source.name })}
							title={m.datasources_test()}
						>
							<RefreshIcon size={16} />
						</button>
					</form>
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
		align-items: center;
		gap: 0.6rem;
		padding: 0.6rem 0.7rem;
		background-color: clr.$surfaceColor;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radius;
		transition: border-color 160ms ease;

		&:hover {
			border-color: clr.$accentMutedColor;
		}

		> .main {
			display: flex;
			flex: 1;
			align-items: center;
			gap: 0.9rem;
			min-width: 0;
			color: inherit;
			text-decoration: none;

			> .box {
				display: inline-grid;
				flex: none;
				place-items: center;
				width: 2.6rem;
				height: 2.6rem;
				color: clr.$accentColor;
				background-color: clr.$accentWashColor;
				border-radius: vars.$radius;
			}

			> .text {
				display: flex;
				flex-direction: column;
				gap: 0.2rem;
				min-width: 0;

				> .name {
					overflow: hidden;
					font-size: 0.92rem;
					color: clr.$textPrimaryColor;
					text-overflow: ellipsis;
					white-space: nowrap;
				}

				> .meta {
					display: flex;
					flex-wrap: wrap;
					gap: 0.2rem 0.6rem;
					min-width: 0;
					font-size: 0.74rem;
					color: clr.$textMutedColor;

					> .kind {
						font-size: 0.66rem;
						letter-spacing: 0.12em;
						text-transform: uppercase;
						color: clr.$textSecondaryColor;
					}

					> .where {
						min-width: 0;
						overflow: hidden;
						font-family: 'Space Mono', monospace;
						text-overflow: ellipsis;
						white-space: nowrap;
					}
				}
			}
		}
	}

	.tool {
		@include forms.toolButton;

		&.spinning > :global(svg) {
			animation: spin 900ms linear infinite;
		}
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.tool.spinning > :global(svg) {
			animation: none;
		}
	}
</style>
