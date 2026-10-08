<script lang="ts">
	import type { Pathname } from '$app/types';
	import { m } from '$lib/paraglide/messages.js';
	import type { DashboardCard } from '$lib/types/dashboard';
	import { localizedHref } from '$lib/utils/navigation';
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import DayChart from './DayChart.svelte';
	import LinkList from './LinkList.svelte';
	import StatGrid from './StatGrid.svelte';

	interface Props {
		card: DashboardCard;
		now: Date;
	}

	let { card, now }: Props = $props();
</script>

<section class="card" aria-labelledby="dashboard-{card.id}">
	<header>
		<h2 id="dashboard-{card.id}">{card.title}</h2>
		<a
			href={localizedHref(card.href as Pathname)}
			aria-label={m.dashboard_open({ title: card.title })}
			title={m.dashboard_open({ title: card.title })}
		>
			<ArrowUpRight size={16} />
		</a>
	</header>
	{#each card.blocks as block, index (index)}
		{#if block.kind === 'stats'}
			<StatGrid stats={block.stats} />
		{:else if block.kind === 'days'}
			<DayChart id="{card.id}-{block.id}" title={block.title} days={block.days} />
		{:else}
			<LinkList title={block.title} links={block.links} empty={block.empty} {now} />
		{/if}
	{/each}
</section>

<style lang="scss">
	@use '../../../styles/colors' as clr;
	@use '../../../styles/forms' as forms;
	@use '../../../styles/variables' as vars;

	// Fills its place in the layout, so the cards of a row end on one line.
	.card {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		min-width: 0;
		height: 100%;
		padding: 0.85rem 1rem 1rem;
		background-color: clr.$surfaceColor;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radius;

		> header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 0.8rem;

			> h2 {
				font-size: 0.72rem;
				letter-spacing: 0.22em;
				text-transform: uppercase;
				color: clr.$accentColor;
			}

			> a {
				@include forms.toolButton;
			}
		}
	}
</style>
