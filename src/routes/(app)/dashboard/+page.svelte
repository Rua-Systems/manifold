<script lang="ts">
	import DashboardCard from '$lib/components/Dashboard/DashboardCard.svelte';
	import PageShell from '$lib/components/PageShell/PageShell.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import type { DashboardCard as Card } from '$lib/types/dashboard';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// The layout is fixed: each known card has its own place, so nothing moves with the numbers and
	// no hole opens beside a short card. The cards are kept in reading order, so the keyboard and a
	// screen reader meet them in the order they are seen. A card of a new module comes after them,
	// one column wide, until the layout gives it a place.
	const PLACES = ['notes', 'access', 'map', 'usage', 'files', 'services'];

	function place(card: Card): number {
		const index = PLACES.indexOf(card.id);
		if (index === -1) {
			return PLACES.length;
		}
		return index;
	}

	const cards = $derived([...data.dashboard.cards].sort((a, b) => place(a) - place(b)));
</script>

<PageShell
	title={m.dashboard_title()}
	sigil={m.dashboard_sigil()}
	metaDescription={m.dashboard_meta_description()}
>
	<div class="layout">
		<div class="cards">
			{#each cards as card (card.id)}
				<div class="cell" data-card={card.id}>
					<DashboardCard {card} now={data.dashboard.generatedAt} />
				</div>
			{/each}
		</div>
	</div>
</PageShell>

<style lang="scss">
	// The columns follow the width the page leaves, which the sidebar changes, not the window.
	.layout {
		container-type: inline-size;
	}

	.cards {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 0.75rem;
	}

	// Two columns: the two long cards side by side, the short ones under them, files and services
	// across.
	@container (min-width: 36rem) {
		.cards {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			grid-template-areas:
				'notes access'
				'map usage'
				'files files'
				'services services';
		}

		.cell[data-card='notes'] {
			grid-area: notes;
		}

		.cell[data-card='access'] {
			grid-area: access;
		}

		.cell[data-card='map'] {
			grid-area: map;
		}

		.cell[data-card='usage'] {
			grid-area: usage;
		}

		.cell[data-card='files'] {
			grid-area: files;
		}

		.cell[data-card='services'] {
			grid-area: services;
		}
	}

	// Three columns: the long cards fill two rows, map and usage share the third column.
	@container (min-width: 56rem) {
		.cards {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			grid-template-areas:
				'notes access map'
				'notes access usage'
				'files files files'
				'services services services';
		}
	}
</style>
