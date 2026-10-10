<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';
	import { postAction } from '$lib/utils/actions';
	import { formatBytes } from '$lib/utils/format';
	import { localizedHref } from '$lib/utils/navigation';
	import { onMount } from 'svelte';
	import { kindLabel } from '../labels';
	import type { PickedFile } from '../types';
	import FileGlyph from './FileGlyph.svelte';

	interface Props {
		onpick: (file: PickedFile) => void;
	}

	let { onpick }: Props = $props();

	const SEARCH_DELAY = 250;

	let query = $state('');
	let files = $state<PickedFile[]>([]);
	let status = $state<'loading' | 'ready' | 'failed'>('loading');
	let timer: ReturnType<typeof setTimeout> | undefined;
	/** Answers that come back after a newer request are dropped. */
	let latest = 0;

	async function load(words: string): Promise<void> {
		latest += 1;
		const request = latest;
		try {
			const result = await postAction(`${localizedHref('/files')}?/browse`, { q: words });
			if (request !== latest) {
				return;
			}
			if (result.type === 'success' && Array.isArray(result.data?.files)) {
				files = result.data.files as PickedFile[];
				status = 'ready';
				return;
			}
			status = 'failed';
		} catch {
			status = 'failed';
		}
	}

	function searchSoon(): void {
		clearTimeout(timer);
		timer = setTimeout(() => void load(query), SEARCH_DELAY);
	}

	onMount(() => {
		void load('');
		return () => clearTimeout(timer);
	});
</script>

<div class="picker">
	<label class="visually-hidden" for="filePickerSearch">{m.files_picker_search()}</label>
	<input
		id="filePickerSearch"
		type="search"
		autocomplete="off"
		placeholder={m.files_picker_search()}
		bind:value={query}
		oninput={searchSoon}
	/>
	<div class="results" aria-live="polite" aria-busy={status === 'loading'}>
		{#if status === 'failed'}
			<p class="state" role="alert">{m.files_picker_failed()}</p>
		{:else if status === 'ready' && files.length === 0}
			<p class="state">{m.files_picker_empty()}</p>
		{:else}
			<ul>
				{#each files as file (file.id)}
					<li>
						<button type="button" onclick={() => onpick(file)}>
							<FileGlyph id={file.id} kind={file.kind} />
							<span class="text">
								<span class="name">{file.name}</span>
								<span class="meta">
									{kindLabel(file.kind)} · {formatBytes(
										file.sizeBytes,
										getLocale()
									)}
								</span>
							</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>

<style lang="scss">
	@use '../../../../styles/colors' as clr;
	@use '../../../../styles/forms' as forms;
	@use '../../../../styles/variables' as vars;

	.picker {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;

		> input {
			@include forms.inputSurface;
		}
	}

	.results {
		height: min(22rem, 55dvh);
		overflow-y: auto;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radius;

		> .state {
			padding: 1rem;
			font-size: 0.84rem;
			color: clr.$textMutedColor;
		}

		> ul {
			margin: 0;
			padding: 0.3rem;
			list-style: none;
		}
	}

	li > button {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		width: 100%;
		min-height: vars.$touchTarget;
		padding: 0.35rem 0.45rem;
		font: inherit;
		text-align: left;
		color: inherit;
		background-color: transparent;
		border: 0;
		border-radius: vars.$radius;
		cursor: pointer;

		&:hover,
		&:focus-visible {
			background-color: clr.$surfaceHoverColor;
		}

		> .text {
			display: flex;
			flex-direction: column;
			gap: 0.1rem;
			min-width: 0;

			> .name {
				overflow: hidden;
				font-size: 0.86rem;
				color: clr.$textPrimaryColor;
				text-overflow: ellipsis;
				white-space: nowrap;
			}

			> .meta {
				font-size: 0.7rem;
				color: clr.$textMutedColor;
			}
		}
	}
</style>
