<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import type { Tag } from '$lib/types/tags';
	import { localizedHref } from '$lib/utils/navigation';

	interface Props {
		/** Every tag to choose from. */
		tags: Tag[];
		/** The ids of the chosen tags. */
		selected: string[];
		/** The form field the chosen ids go out as, once each. */
		name?: string;
		legend: string;
		/** Set when the chosen tags were refused, for the error below the choice. */
		error?: string;
		idPrefix: string;
		/** Called after the owner picks or drops a tag. */
		onchange?: () => void;
	}

	let {
		tags,
		selected = $bindable(),
		name = 'tags',
		legend,
		error = '',
		idPrefix,
		onchange
	}: Props = $props();

	function toggle(id: string, checked: boolean): void {
		if (checked) {
			selected = [...new Set([...selected, id])];
		} else {
			selected = selected.filter((item) => item !== id);
		}
		onchange?.();
	}
</script>

<fieldset class="picker" aria-describedby="{idPrefix}Error">
	<legend>{legend}</legend>
	{#if tags.length === 0}
		<p class="empty">
			{m.tags_picker_empty()}
			<a href={localizedHref('/settings/tags')}>{m.tags_picker_manage()}</a>
		</p>
	{:else}
		<div class="options">
			{#each tags as tag (tag.id)}
				<label class="option" style:--tagColor="var(--color-tag-{tag.color})">
					<input
						type="checkbox"
						{name}
						value={tag.id}
						checked={selected.includes(tag.id)}
						onchange={(event) => toggle(tag.id, event.currentTarget.checked)}
					/>
					<span>{tag.name}</span>
				</label>
			{/each}
		</div>
	{/if}
	<p class="error" id="{idPrefix}Error">{error}</p>
</fieldset>

<style lang="scss">
	@use '../../../styles/colors' as clr;
	@use '../../../styles/forms' as forms;
	@use '../../../styles/variables' as vars;

	.picker {
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;

		> legend {
			@include forms.fieldLabel;
			padding: 0;
		}

		> .empty {
			font-size: 0.8rem;
			color: clr.$textMutedColor;

			> a {
				@include forms.mutedLink;
			}
		}

		> .error {
			@include forms.fieldError;
		}
	}

	.options {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	// The checkbox stays a real one for keyboards and screen readers; the chip around it shows the
	// state with its border and a filled mark.
	.option {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 2rem;
		padding: 0.2rem 0.6rem;
		font-size: 0.76rem;
		color: clr.$textSecondaryColor;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radius;
		cursor: pointer;
		transition:
			color 160ms ease,
			border-color 160ms ease;

		> input {
			position: absolute;
			inset: 0;
			width: 100%;
			height: 100%;
			margin: 0;
			opacity: 0;
			cursor: pointer;
		}

		> span::before {
			content: '';
			display: inline-block;
			width: 0.5rem;
			height: 0.5rem;
			margin-right: 0.4rem;
			border: 1px solid var(--tagColor);
			border-radius: 50%;
		}

		&:hover {
			border-color: clr.$accentMutedColor;
		}

		&:has(input:checked) {
			color: clr.$textPrimaryColor;
			border-color: var(--tagColor);

			> span::before {
				background-color: var(--tagColor);
			}
		}

		&:has(input:focus-visible) {
			outline: 2px solid clr.$focusRingColor;
			outline-offset: 2px;
		}
	}
</style>
