<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';

	interface Props {
		notes: { id: string; title: string }[];
		onpick: (id: string) => void;
	}

	let { notes, onpick }: Props = $props();

	/** More would make a long list nobody scrolls; the filter narrows it instead. */
	const SHOWN = 50;

	let query = $state('');

	const matches = $derived.by(() => {
		const needle = query.trim().toLocaleLowerCase();
		return notes
			.filter((item) =>
				(item.title || m.notes_untitled()).toLocaleLowerCase().includes(needle)
			)
			.slice(0, SHOWN);
	});
</script>

<div class="picker">
	<label class="visually-hidden" for="notePickerFilter">{m.map_picker_filter()}</label>
	<input
		id="notePickerFilter"
		type="search"
		autocomplete="off"
		placeholder={m.map_picker_filter()}
		bind:value={query}
	/>
	{#if matches.length === 0}
		<p class="empty">{m.notes_no_match()}</p>
	{:else}
		<ul aria-label={m.map_picker_label()}>
			{#each matches as item (item.id)}
				<li>
					<button type="button" onclick={() => onpick(item.id)}>
						{item.title || m.notes_untitled()}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style lang="scss">
	@use '../../../../styles/colors' as clr;
	@use '../../../../styles/forms' as forms;
	@use '../../../../styles/variables' as vars;

	.picker {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;

		> input {
			@include forms.inputSurface;
		}

		> .empty {
			font-size: 0.82rem;
			color: clr.$textMutedColor;
		}

		> ul {
			display: flex;
			flex-direction: column;
			gap: 0.3rem;
			margin: 0;
			padding: 0;
			list-style: none;

			> li > button {
				width: 100%;
				min-height: vars.$touchTarget;
				padding: 0.5rem 0.8rem;
				overflow: hidden;
				font-size: 0.86rem;
				text-align: left;
				text-overflow: ellipsis;
				white-space: nowrap;
				color: clr.$textPrimaryColor;
				background-color: transparent;
				border: 1px solid clr.$borderSubtleColor;
				border-radius: vars.$radius;
				cursor: pointer;

				&:hover {
					border-color: clr.$accentColor;
					background-color: clr.$accentWashColor;
				}
			}
		}
	}
</style>
