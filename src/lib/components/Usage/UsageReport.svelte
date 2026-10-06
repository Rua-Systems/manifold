<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import type { UsageReport } from '$lib/types/usage';
	import { formatBytes, formatSeconds } from '$lib/utils/format';
	import { relativeTime } from '$lib/utils/time';
	import type { UsageTableSection } from './types';
	import UsageTable from './UsageTable.svelte';

	interface Props {
		report: UsageReport;
	}

	let { report }: Props = $props();

	let measuring = $state(false);

	const locale = $derived(getLocale());
	const numberFormat = $derived(new Intl.NumberFormat(locale));
	/** In UTC, so the server's text and the browser's agree whatever their time zones. */
	const timeFormat = $derived(
		new Intl.DateTimeFormat(locale, { timeStyle: 'medium', timeZone: 'UTC' })
	);

	const contentSections: UsageTableSection[] = $derived(
		report.content.map((group) => ({ id: group.id, label: group.label, rows: group.items }))
	);
	const fileSections: UsageTableSection[] = $derived([
		{
			id: 'files',
			label: null,
			rows: report.files.map((item) => ({ ...item, id: item.owner }))
		}
	]);
	const tableSections: UsageTableSection[] = $derived([
		{
			id: 'tables',
			label: null,
			rows: report.database.tables.map((table) => ({
				id: table.name,
				label: table.name,
				count: table.rows,
				bytes: table.bytes
			}))
		}
	]);

	/** Measures again in place; without JavaScript the form reloads the page instead. */
	async function measureAgain(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		measuring = true;
		try {
			await invalidateAll();
		} finally {
			measuring = false;
		}
	}
</script>

<div class="measured">
	<p>
		{m.usage_measured({ time: `${timeFormat.format(report.measuredAt)} UTC` })}
	</p>
	<form method="GET" onsubmit={measureAgain}>
		<button type="submit" disabled={measuring} aria-busy={measuring}>
			{m.usage_refresh()}
		</button>
	</form>
</div>
<section class="section" aria-labelledby="usageOverviewHeading">
	<h2 id="usageOverviewHeading">{m.usage_overview()}</h2>
	<dl class="readouts">
		<div class="readout">
			<dt>{m.usage_database()}</dt>
			<dd class="value">{formatBytes(report.database.bytes, locale)}</dd>
		</div>
		<div class="readout">
			<dt>{m.usage_files()}</dt>
			<dd class="value">{formatBytes(report.storage.uploadBytes, locale)}</dd>
			<dd class="detail">
				{m.usage_upload_count({ count: numberFormat.format(report.storage.uploadFiles) })}
			</dd>
		</div>
		<div class="readout">
			<dt>{m.usage_disk()}</dt>
			{#if report.storage.diskFreeBytes !== null && report.storage.diskBytes !== null}
				<dd class="value">{formatBytes(report.storage.diskFreeBytes, locale)}</dd>
				<dd class="detail">
					{m.usage_disk_detail({ total: formatBytes(report.storage.diskBytes, locale) })}
				</dd>
			{:else}
				<dd class="detail">{m.usage_disk_unknown()}</dd>
			{/if}
		</div>
		<div class="readout">
			<dt>{m.usage_memory()}</dt>
			<dd class="value">{formatBytes(report.process.rssBytes, locale)}</dd>
		</div>
	</dl>
</section>
<section class="section" aria-labelledby="usageContentHeading">
	<h2 id="usageContentHeading">{m.usage_content()}</h2>
	<p class="lead">{m.usage_content_lead()}</p>
	<UsageTable
		caption={m.usage_content()}
		kindLabel={m.usage_kind()}
		countLabel={m.usage_count()}
		sections={contentSections}
	/>
</section>
<section class="section" aria-labelledby="usageFilesHeading">
	<h2 id="usageFilesHeading">{m.usage_files()}</h2>
	<p class="lead">{m.usage_files_lead()}</p>
	{#if report.files.length === 0}
		<p class="empty">{m.usage_files_empty()}</p>
	{:else}
		<UsageTable
			caption={m.usage_files()}
			kindLabel={m.usage_owner()}
			countLabel={m.usage_count()}
			sections={fileSections}
		/>
	{/if}
</section>
<section class="section" aria-labelledby="usageDatabaseHeading">
	<h2 id="usageDatabaseHeading">{m.usage_database()}</h2>
	<p class="lead">{m.usage_database_lead()}</p>
	<UsageTable
		caption={m.usage_database()}
		kindLabel={m.usage_table()}
		countLabel={m.usage_rows()}
		sections={tableSections}
	/>
</section>
<section class="section" aria-labelledby="usageServerHeading">
	<h2 id="usageServerHeading">{m.usage_server()}</h2>
	<dl class="record">
		<div class="row">
			<dt>{m.usage_version()}</dt>
			<dd>{report.process.version}</dd>
		</div>
		<div class="row">
			<dt>{m.usage_node()}</dt>
			<dd>{report.process.nodeVersion}</dd>
		</div>
		<div class="row">
			<dt>{m.usage_started()}</dt>
			<dd>
				<time datetime={report.process.startedAt.toISOString()}>
					{relativeTime(report.process.startedAt, locale, report.measuredAt)}
				</time>
			</dd>
		</div>
		<div class="row">
			<dt>{m.usage_memory()}</dt>
			<dd>{formatBytes(report.process.rssBytes, locale)}</dd>
		</div>
		<div class="row">
			<dt>{m.usage_heap()}</dt>
			<dd>
				{m.usage_heap_detail({
					used: formatBytes(report.process.heapUsedBytes, locale),
					total: formatBytes(report.process.heapTotalBytes, locale)
				})}
			</dd>
		</div>
		<div class="row">
			<dt>{m.usage_cpu()}</dt>
			<dd>{formatSeconds(report.process.cpuSeconds, locale)}</dd>
		</div>
	</dl>
</section>

<style lang="scss">
	@use '../../../styles/colors' as clr;
	@use '../../../styles/forms' as forms;
	@use '../../../styles/variables' as vars;

	.measured {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.8rem;
		max-width: 48rem;
		margin-bottom: 1.6rem;

		> p {
			font-size: 0.78rem;
			color: clr.$textMutedColor;
		}

		> form > button {
			@include forms.quietButton;
			border: 1px solid clr.$borderSubtleColor;
		}
	}

	.section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-width: 48rem;
		margin-bottom: 2.6rem;

		> h2 {
			display: flex;
			align-items: center;
			gap: 0.9rem;
			font-size: 0.7rem;
			letter-spacing: 0.24em;
			text-transform: uppercase;
			color: clr.$accentColor;

			&::after {
				content: '';
				flex: 1;
				height: 1px;
				background-color: clr.$borderSubtleColor;
			}
		}

		> .lead {
			font-size: 0.82rem;
			color: clr.$textSecondaryColor;
		}

		> .empty {
			font-size: 0.86rem;
			color: clr.$textMutedColor;
		}
	}

	.readouts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: 0.6rem;
		margin: 0;

		> .readout {
			display: flex;
			flex-direction: column;
			gap: 0.3rem;
			padding: 0.8rem 0.9rem;
			background-color: clr.$surfaceColor;
			border: 1px solid clr.$borderSubtleColor;
			border-radius: vars.$radius;

			> dt {
				font-size: 0.64rem;
				letter-spacing: 0.16em;
				text-transform: uppercase;
				color: clr.$textMutedColor;
			}

			> dd {
				margin: 0;
			}

			> .value {
				font-size: 1.15rem;
				font-variant-numeric: tabular-nums;
				color: clr.$textPrimaryColor;
			}

			> .detail {
				font-size: 0.72rem;
				color: clr.$textSecondaryColor;
			}
		}
	}

	.record {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		margin: 0;

		> .row {
			display: grid;
			grid-template-columns: 11rem 1fr;
			gap: 1rem;

			> dt {
				font-size: 0.68rem;
				letter-spacing: 0.18em;
				text-transform: uppercase;
				color: clr.$textMutedColor;
			}

			> dd {
				margin: 0;
				font-size: 0.82rem;
				color: clr.$textSecondaryColor;
			}
		}
	}

	@media (max-width: vars.$mobileMax) {
		.record > .row {
			grid-template-columns: 1fr;
			gap: 0.2rem;
		}
	}
</style>
