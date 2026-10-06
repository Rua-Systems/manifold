<script lang="ts">
	import DashboardCard from '$lib/components/Dashboard/DashboardCard.svelte';
	import PageShell from '$lib/components/PageShell/PageShell.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<PageShell
	title={m.dashboard_title()}
	sigil={m.dashboard_sigil()}
	metaDescription={m.dashboard_meta_description()}
>
	<div class="cards">
		{#each data.dashboard.cards as card (card.id)}
			<DashboardCard {card} now={data.dashboard.generatedAt} />
		{/each}
	</div>
</PageShell>

<style lang="scss">
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr));
		align-items: start;
		gap: 1rem;
	}
</style>
