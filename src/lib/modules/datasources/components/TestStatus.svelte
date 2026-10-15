<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import { relativeTime } from '$lib/utils/time';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import CircleDashedIcon from '@lucide/svelte/icons/circle-dashed';
	import CircleXIcon from '@lucide/svelte/icons/circle-x';
	import type { DataSourceTest } from '../types';

	interface Props {
		test: DataSourceTest | null;
		/** Shows the message of the test as well, not only whether it worked. */
		detailed?: boolean;
	}

	let { test, detailed = false }: Props = $props();
</script>

<span class="status" class:ok={test?.ok === true} class:failed={test?.ok === false}>
	{#if test === null}
		<CircleDashedIcon size={14} aria-hidden="true" />
		<span>{m.datasources_test_never()}</span>
	{:else}
		{#if test.ok}
			<CircleCheckIcon size={14} aria-hidden="true" />
			<span>{m.datasources_test_ok()}</span>
		{:else}
			<CircleXIcon size={14} aria-hidden="true" />
			<span>{m.datasources_test_failed()}</span>
		{/if}
		<time datetime={test.at.toISOString()}>{relativeTime(test.at, getLocale())}</time>
	{/if}
</span>
{#if detailed && test !== null && test.message !== ''}
	<span class="message">{test.message}</span>
{/if}

<style lang="scss">
	@use '../../../../styles/colors' as clr;

	.status {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.68rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: clr.$textMutedColor;

		&.ok {
			color: clr.$accentColor;
		}

		&.failed {
			color: clr.$errorColor;
		}

		> time {
			letter-spacing: 0.04em;
			text-transform: none;
			color: clr.$textMutedColor;
		}
	}

	.message {
		display: block;
		margin-top: 0.35rem;
		font-family: 'Space Mono', monospace;
		font-size: 0.72rem;
		line-height: 1.5;
		overflow-wrap: anywhere;
		color: clr.$textSecondaryColor;
	}
</style>
