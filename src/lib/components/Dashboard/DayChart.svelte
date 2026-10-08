<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import type { DashboardDay } from '$lib/types/dashboard';

	interface Props {
		id: string;
		title: string;
		days: DashboardDay[];
	}

	let { id, title, days }: Props = $props();

	/** The plot, in CSS pixels; the width follows the card, the server renders the default. */
	const HEIGHT = 116;
	const TOP = 16;
	const BOTTOM = 22;
	const LEFT = 28;
	const BAR_MAX = 24;
	const GAP = 2;
	const RADIUS = 4;

	let width = $state(480);
	/** The day under the pointer or the keyboard, or null. */
	let active = $state<number | null>(null);

	const locale = $derived(getLocale());
	const numberFormat = $derived(new Intl.NumberFormat(locale));
	const dayFormat = $derived(
		new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' })
	);

	const plotWidth = $derived(Math.max(width - LEFT, 1));
	const plotHeight = HEIGHT - TOP - BOTTOM;
	const band = $derived(plotWidth / Math.max(days.length, 1));
	const barWidth = $derived(Math.max(Math.min(BAR_MAX, band - GAP), 1));

	const total = $derived(days.reduce((sum, day) => sum + day.value, 0));
	const peak = $derived(
		days.reduce<DashboardDay | null>((best, day) => {
			if (best === null || day.value > best.value) {
				return day;
			}
			return best;
		}, null)
	);
	/** The axis ends on a round number at or above the highest day: 1, 2 or 5 times a power of ten. */
	const scaleMax = $derived.by(() => {
		const highest = peak?.value ?? 0;
		if (highest <= 0) {
			return 1;
		}
		const power = 10 ** Math.floor(Math.log10(highest));
		for (const step of [1, 2, 5, 10]) {
			if (step * power >= highest) {
				return step * power;
			}
		}
		return 10 * power;
	});

	function label(day: string): string {
		return dayFormat.format(new Date(`${day}T00:00:00Z`));
	}

	function x(index: number): number {
		return LEFT + index * band + (band - barWidth) / 2;
	}

	function y(value: number): number {
		return TOP + plotHeight - (value / scaleMax) * plotHeight;
	}

	/** A column with a rounded top and a square foot on the baseline. */
	function column(index: number, value: number): string {
		const left = x(index);
		const right = left + barWidth;
		const top = y(value);
		const bottom = TOP + plotHeight;
		const radius = Math.min(RADIUS, barWidth / 2, bottom - top);
		return [
			`M${left},${bottom}`,
			`V${top + radius}`,
			`Q${left},${top} ${left + radius},${top}`,
			`H${right - radius}`,
			`Q${right},${top} ${right},${top + radius}`,
			`V${bottom}`,
			'Z'
		].join(' ');
	}

	const summary = $derived.by(() => {
		if (total === 0 || peak === null) {
			return m.dashboard_chart_none();
		}
		return m.dashboard_chart_summary({
			total: numberFormat.format(total),
			date: label(peak.day),
			max: numberFormat.format(peak.value)
		});
	});

	/** Gridlines at zero, the top and, when it is a whole number, halfway. */
	const gridTicks = $derived.by(() => {
		if (scaleMax % 2 === 0) {
			return [0, scaleMax / 2, scaleMax];
		}
		return [0, scaleMax];
	});

	/** The first label starts at its column and the last ends at it, so neither leaves the plot. */
	function anchor(index: number): 'start' | 'middle' | 'end' {
		if (index === 0) {
			return 'start';
		}
		if (index === days.length - 1) {
			return 'end';
		}
		return 'middle';
	}

	/** First, middle and last day under the axis; the table has every day. */
	const ticks = $derived(
		[...new Set([0, Math.floor((days.length - 1) / 2), days.length - 1])].filter(
			(index) => index >= 0
		)
	);

	function onPointerMove(event: PointerEvent): void {
		const bounds = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
		const index = Math.floor((event.clientX - bounds.left - LEFT) / band);
		if (index < 0 || index >= days.length) {
			active = null;
			return;
		}
		active = index;
	}

	function onKeydown(event: KeyboardEvent): void {
		const last = days.length - 1;
		let next = active ?? last;
		if (event.key === 'ArrowLeft') {
			next = Math.max(0, next - 1);
		} else if (event.key === 'ArrowRight') {
			next = Math.min(last, next + 1);
		} else if (event.key === 'Home') {
			next = 0;
		} else if (event.key === 'End') {
			next = last;
		} else {
			return;
		}
		event.preventDefault();
		active = next;
	}

	const tip = $derived.by(() => {
		if (active === null || days[active] === undefined) {
			return null;
		}
		const day = days[active];
		return {
			text: m.dashboard_chart_value({
				value: numberFormat.format(day.value),
				date: label(day.day)
			}),
			left: Math.min(Math.max(x(active) + barWidth / 2, 60), width - 60)
		};
	});
</script>

<div class="block">
	<h3 id="{id}Title">{title}</h3>
	<p class="summary">{summary}</p>
	<!-- A slider over the days: arrow keys pick a day and read its value; the table has them all. -->
	<div
		class="chart"
		bind:clientWidth={width}
		role="slider"
		aria-labelledby="{id}Title"
		aria-valuemin={0}
		aria-valuemax={Math.max(days.length - 1, 0)}
		aria-valuenow={active ?? Math.max(days.length - 1, 0)}
		aria-valuetext={tip?.text ?? summary}
		tabindex="0"
		onkeydown={onKeydown}
		onfocus={() => (active ??= days.length - 1)}
		onblur={() => (active = null)}
	>
		<svg
			{width}
			height={HEIGHT}
			viewBox="0 0 {width} {HEIGHT}"
			aria-hidden="true"
			onpointermove={onPointerMove}
			onpointerleave={() => (active = null)}
		>
			{#each gridTicks as tick (tick)}
				<line class="grid" x1={LEFT} x2={width} y1={y(tick)} y2={y(tick)} />
				<text
					class="axis"
					x={LEFT - 6}
					y={y(tick)}
					text-anchor="end"
					dominant-baseline="middle"
				>
					{numberFormat.format(tick)}
				</text>
			{/each}
			{#each days as day, index (day.day)}
				{#if day.value > 0}
					<path
						class="bar"
						class:dim={active !== null && active !== index}
						d={column(index, day.value)}
					/>
				{/if}
			{/each}
			{#if peak !== null && peak.value > 0}
				{@const index = days.indexOf(peak)}
				<text
					class="value"
					x={x(index) + barWidth / 2}
					y={y(peak.value) - 5}
					text-anchor="middle"
				>
					{numberFormat.format(peak.value)}
				</text>
			{/if}
			{#each ticks as index (index)}
				<text
					class="axis"
					x={x(index) + barWidth / 2}
					y={HEIGHT - 6}
					text-anchor={anchor(index)}
				>
					{label(days[index].day)}
				</text>
			{/each}
		</svg>
		{#if tip !== null}
			<p class="tip" style:left="{tip.left}px" aria-hidden="true">{tip.text}</p>
		{/if}
	</div>
	<table class="visually-hidden" id="{id}Table">
		<caption>{title}</caption>
		<thead>
			<tr>
				<th scope="col">{m.dashboard_chart_day()}</th>
				<th scope="col">{m.dashboard_chart_count()}</th>
			</tr>
		</thead>
		<tbody>
			{#each days as day (day.day)}
				<tr>
					<th scope="row">{label(day.day)}</th>
					<td>{numberFormat.format(day.value)}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style lang="scss">
	@use '../../../styles/colors' as clr;
	@use '../../../styles/variables' as vars;

	.block {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;

		> h3 {
			font-size: 0.64rem;
			font-weight: 400;
			letter-spacing: 0.16em;
			text-transform: uppercase;
			color: clr.$textMutedColor;
		}

		> .summary {
			font-size: 0.78rem;
			color: clr.$textSecondaryColor;
		}
	}

	.chart {
		position: relative;
		width: 100%;
		border-radius: vars.$radius;

		&:focus-visible {
			outline: 2px solid clr.$focusRingColor;
			outline-offset: 2px;
		}

		> svg {
			display: block;
			overflow: visible;
		}

		> .tip {
			position: absolute;
			top: 0;
			padding: 0.25rem 0.5rem;
			font-size: 0.74rem;
			font-weight: 700;
			white-space: nowrap;
			color: clr.$textPrimaryColor;
			pointer-events: none;
			background-color: clr.$panelColor;
			border: 1px solid clr.$borderSubtleColor;
			border-radius: vars.$radius;
			box-shadow: 0 6px 18px clr.$shadowColor;
			transform: translate(-50%, -100%);
		}
	}

	.grid {
		stroke: clr.$borderMutedColor;
		stroke-width: 1;
		shape-rendering: crispEdges;
	}

	.axis {
		font-size: 10px;
		font-variant-numeric: tabular-nums;
		fill: clr.$textMutedColor;
	}

	.value {
		font-size: 10px;
		font-weight: 700;
		fill: clr.$textSecondaryColor;
	}

	.bar {
		fill: clr.$chartColor;
		transition: opacity 0.12s ease;

		&.dim {
			opacity: 0.45;
		}
	}
</style>
