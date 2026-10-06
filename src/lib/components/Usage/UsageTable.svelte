<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import { formatBytes } from '$lib/utils/format';
	import type { UsageTableSection } from './types';

	interface Props {
		caption: string;
		/** The heading of the first column, such as "Kind" or "Table". */
		kindLabel: string;
		countLabel: string;
		sections: UsageTableSection[];
	}

	let { caption, kindLabel, countLabel, sections }: Props = $props();

	const locale = $derived(getLocale());
	const numberFormat = $derived(new Intl.NumberFormat(locale));
	const largest = $derived(
		Math.max(0, ...sections.flatMap((section) => section.rows.map((row) => row.bytes)))
	);

	/** The bar's share of the largest row; anything above zero stays visible. */
	function barWidth(bytes: number): string {
		if (largest === 0 || bytes === 0) {
			return '0';
		}
		return `max(2px, ${(bytes / largest) * 100}%)`;
	}
</script>

<table class="usage">
	<caption class="visually-hidden">{caption}</caption>
	<thead>
		<tr>
			<th scope="col">{kindLabel}</th>
			<th scope="col" class="number">{countLabel}</th>
			<th scope="col" class="number">{m.usage_size()}</th>
		</tr>
	</thead>
	{#each sections as section (section.id)}
		<tbody>
			{#if section.label !== null}
				<tr class="group">
					<th scope="rowgroup" colspan="3">{section.label}</th>
				</tr>
			{/if}
			{#each section.rows as row (row.id)}
				<tr>
					<th scope="row">{row.label}</th>
					<td class="number">{numberFormat.format(row.count)}</td>
					<td class="number">
						{formatBytes(row.bytes, locale)}
						<span class="bar" aria-hidden="true">
							<span style:width={barWidth(row.bytes)}></span>
						</span>
					</td>
				</tr>
			{/each}
		</tbody>
	{/each}
</table>

<style lang="scss">
	@use '../../../styles/colors' as clr;

	.usage {
		width: 100%;
		font-size: 0.8rem;
		border-collapse: collapse;

		> thead > tr > th {
			padding: 0.5rem 0.6rem;
			font-size: 0.64rem;
			font-weight: 400;
			letter-spacing: 0.16em;
			text-align: left;
			text-transform: uppercase;
			color: clr.$textMutedColor;
			border-bottom: 1px solid clr.$borderMutedColor;

			&.number {
				text-align: right;
			}
		}

		> tbody > tr {
			> th,
			> td {
				padding: 0.5rem 0.6rem;
				font-weight: 400;
				text-align: left;
				vertical-align: top;
				border-bottom: 1px solid clr.$borderMutedColor;
			}

			> th {
				color: clr.$textPrimaryColor;
				overflow-wrap: anywhere;
			}

			> td {
				color: clr.$textSecondaryColor;
				white-space: nowrap;
				font-variant-numeric: tabular-nums;

				&.number {
					width: 7.5rem;
					text-align: right;
				}

				> .bar {
					display: block;
					height: 3px;
					margin-top: 0.35rem;
					background-color: clr.$borderMutedColor;

					> span {
						display: block;
						height: 100%;
						margin-left: auto;
						background-color: clr.$accentColor;
					}
				}
			}

			&.group > th {
				padding-top: 1rem;
				font-size: 0.66rem;
				letter-spacing: 0.18em;
				text-transform: uppercase;
				color: clr.$accentColor;
			}
		}
	}
</style>
