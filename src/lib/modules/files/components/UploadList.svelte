<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import { formatBytes } from '$lib/utils/format';
	import type { UploadQueue, UploadStatus } from '../upload-queue.svelte';

	interface Props {
		queue: UploadQueue;
	}

	let { queue }: Props = $props();

	const STATUS_LABELS: Record<UploadStatus, () => string> = {
		waiting: m.files_upload_waiting,
		sending: m.files_upload_sending,
		done: m.files_upload_done,
		failed: m.files_upload_failed
	};
</script>

{#if queue.items.length > 0}
	<section class="uploads" aria-label={m.files_uploads()}>
		<header>
			<h2>{m.files_uploads()}</h2>
			<button type="button" class="clear" disabled={queue.busy} onclick={() => queue.clear()}>
				{m.files_uploads_clear()}
			</button>
		</header>
		<ul>
			{#each queue.items as item (item.id)}
				<li class={item.status}>
					<div class="line">
						<span class="name">{item.name}</span>
						<span class="size">{formatBytes(item.size, getLocale())}</span>
						<span class="state">{STATUS_LABELS[item.status]()}</span>
					</div>
					<progress
						max="1"
						value={item.progress}
						aria-label={m.files_upload_progress({ name: item.name })}
					></progress>
					<p class="message" role={item.status === 'failed' ? 'alert' : undefined}>
						{item.message}
					</p>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style lang="scss">
	@use '../../../../styles/colors' as clr;
	@use '../../../../styles/forms' as forms;
	@use '../../../../styles/variables' as vars;

	.uploads {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin-bottom: 1.2rem;
		padding: 0.8rem 0.9rem;
		background-color: clr.$surfaceColor;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radius;

		> header {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 1rem;

			> h2 {
				font-size: 0.68rem;
				letter-spacing: 0.2em;
				text-transform: uppercase;
				color: clr.$accentColor;
			}

			> .clear {
				@include forms.quietButton;
			}
		}

		> ul {
			display: flex;
			flex-direction: column;
			gap: 0.5rem;
			max-height: 16rem;
			margin: 0;
			padding: 0;
			overflow-y: auto;
			list-style: none;
		}
	}

	li {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;

		> .line {
			display: flex;
			align-items: baseline;
			gap: 0.8rem;
			font-size: 0.8rem;

			> .name {
				flex: 1;
				min-width: 0;
				overflow: hidden;
				color: clr.$textPrimaryColor;
				text-overflow: ellipsis;
				white-space: nowrap;
			}

			> .size,
			> .state {
				flex: none;
				font-size: 0.7rem;
				color: clr.$textMutedColor;
			}
		}

		> progress {
			width: 100%;
			height: 3px;
			accent-color: clr.$accentColor;
		}

		> .message {
			min-height: 1em;
			font-size: 0.72rem;
			color: clr.$errorColor;
		}

		&.done > .line > .state {
			color: clr.$accentColor;
		}

		&.failed > .line > .state {
			color: clr.$errorColor;
		}
	}
</style>
