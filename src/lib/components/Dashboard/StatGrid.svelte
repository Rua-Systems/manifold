<script lang="ts">
	import { getLocale } from '$lib/paraglide/runtime.js';
	import type { DashboardStat } from '$lib/types/dashboard';
	import { formatBytes } from '$lib/utils/format';

	interface Props {
		stats: DashboardStat[];
	}

	let { stats }: Props = $props();

	const locale = $derived(getLocale());
	const numberFormat = $derived(new Intl.NumberFormat(locale));

	function valueOf(stat: DashboardStat): string {
		if (stat.unit === 'bytes') {
			return formatBytes(stat.value, locale);
		}
		return numberFormat.format(stat.value);
	}
</script>

<dl class="stats">
	{#each stats as stat (stat.id)}
		<div class="stat">
			<dt>{stat.label}</dt>
			<dd>{valueOf(stat)}</dd>
		</div>
	{/each}
</dl>

<style lang="scss">
	@use '../../../styles/colors' as clr;

	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr));
		gap: 0.9rem 1rem;
		margin: 0;

		> .stat {
			display: flex;
			flex-direction: column-reverse;
			gap: 0.2rem;

			> dt {
				font-size: 0.64rem;
				letter-spacing: 0.14em;
				text-transform: uppercase;
				color: clr.$textMutedColor;
			}

			> dd {
				margin: 0;
				font-size: 1.45rem;
				font-weight: 700;
				line-height: 1.1;
				color: clr.$textPrimaryColor;
			}
		}
	}
</style>
