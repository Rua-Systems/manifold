<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import { parseCsv } from '$lib/utils/csv';
	import { formatBytes } from '$lib/utils/format';
	import { onMount } from 'svelte';

	interface Props {
		src: string;
		mimeType: string;
		sizeBytes: number;
	}

	let { src, mimeType, sizeBytes }: Props = $props();

	/** Only the start of a large file is shown; it is fetched as a range. */
	const PREVIEW_BYTES = 1024 * 1024;
	const TABLE_ROWS = 500;

	let text = $state<string | null>(null);
	let failed = $state(false);

	onMount(() => {
		void (async () => {
			try {
				const response = await fetch(src, {
					headers: { range: `bytes=0-${PREVIEW_BYTES - 1}` }
				});
				if (!response.ok) {
					failed = true;
					return;
				}
				text = await response.text();
			} catch {
				failed = true;
			}
		})();
	});

	const truncated = $derived(sizeBytes > PREVIEW_BYTES);

	const rows = $derived.by(() => {
		if (mimeType !== 'text/csv' || text === null) {
			return null;
		}
		return parseCsv(text, TABLE_ROWS);
	});

	/** JSON is indented when the whole file arrived and reads as JSON; else it stays as it is. */
	const shown = $derived.by(() => {
		if (text === null || mimeType !== 'application/json' || truncated) {
			return text;
		}
		try {
			return JSON.stringify(JSON.parse(text), null, 2);
		} catch {
			return text;
		}
	});
</script>

<div class="text-preview" aria-busy={text === null && !failed}>
	{#if failed}
		<p class="state" role="alert">{m.files_preview_failed()}</p>
	{:else if text === null}
		<p class="state">{m.files_preview_loading()}</p>
	{:else}
		{#if truncated}
			<p class="state">
				{m.files_preview_truncated({ size: formatBytes(PREVIEW_BYTES, getLocale()) })}
			</p>
		{/if}
		{#if rows !== null}
			<div class="table">
				<table>
					<tbody>
						{#each rows as row, index (index)}
							<tr>
								{#each row as cell, column (column)}
									<td>{cell}</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			{#if rows.length >= TABLE_ROWS}
				<p class="state">{m.files_preview_rows({ count: TABLE_ROWS })}</p>
			{/if}
		{:else}
			<pre>{shown}</pre>
		{/if}
	{/if}
</div>

<style lang="scss">
	@use '../../../../styles/colors' as clr;
	@use '../../../../styles/variables' as vars;

	.text-preview {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		min-width: 0;

		> .state {
			font-size: 0.8rem;
			color: clr.$textMutedColor;
		}

		> pre {
			max-height: 70vh;
			margin: 0;
			padding: 1rem;
			overflow: auto;
			font-size: 0.8rem;
			line-height: 1.55;
			color: clr.$textPrimaryColor;
			white-space: pre-wrap;
			overflow-wrap: anywhere;
			background-color: clr.$surfaceColor;
			border: 1px solid clr.$borderSubtleColor;
			border-radius: vars.$radius;
		}
	}

	.table {
		max-height: 70vh;
		overflow: auto;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radius;

		> table {
			border-collapse: collapse;
			font-size: 0.78rem;

			td {
				padding: 0.35rem 0.6rem;
				color: clr.$textPrimaryColor;
				white-space: nowrap;
				border-bottom: 1px solid clr.$borderMutedColor;
			}

			tr:first-child > td {
				font-weight: 700;
				background-color: clr.$surfaceHoverColor;
			}
		}
	}
</style>
