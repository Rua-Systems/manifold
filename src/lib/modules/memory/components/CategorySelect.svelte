<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import type { MemoryCategory } from '../types';

	interface Props {
		categories: MemoryCategory[];
		/** The chosen category id, '' for none. */
		value: string;
		id: string;
		name?: string;
		/** The label of the empty choice: no category, or every category in a filter. */
		emptyLabel: string;
		/** Offers `none`, for filters that look for memories without a category. */
		noneOption?: boolean;
		describedBy?: string;
		invalid?: boolean;
		onchange?: () => void;
	}

	let {
		categories,
		value = $bindable(),
		id,
		name = 'category',
		emptyLabel,
		noneOption = false,
		describedBy,
		invalid = false,
		onchange
	}: Props = $props();

	const top = $derived(categories.filter((category) => category.parentId === null));
</script>

<select {id} {name} bind:value aria-describedby={describedBy} aria-invalid={invalid} {onchange}>
	<option value="">{emptyLabel}</option>
	{#if noneOption}
		<option value="none">{m.memory_category_none()}</option>
	{/if}
	{#each top as category (category.id)}
		<option value={category.id}>{category.name}</option>
		{#each categories.filter((child) => child.parentId === category.id) as child (child.id)}
			<option value={child.id}>{category.name} / {child.name}</option>
		{/each}
	{/each}
</select>

<style lang="scss">
	@use '../../../../styles/forms' as forms;

	select {
		@include forms.inputSurface;
		padding-right: 2rem;
	}
</style>
