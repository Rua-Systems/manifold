<script lang="ts">
	import type { TagColor } from '$lib/types/tags';

	interface Props {
		name: string;
		color: TagColor;
	}

	let { name, color }: Props = $props();
</script>

<span class="chip" style:--tagColor="var(--color-tag-{color})">{name}</span>

<style lang="scss">
	@use '../../../styles/colors' as clr;
	@use '../../../styles/variables' as vars;

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		max-width: 100%;
		padding: 0.12rem 0.5rem;
		overflow: hidden;
		font-size: 0.72rem;
		line-height: 1.4;
		color: clr.$textSecondaryColor;
		text-overflow: ellipsis;
		white-space: nowrap;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radius;

		&::before {
			content: '';
			flex: none;
			width: 0.45rem;
			height: 0.45rem;
			background-color: var(--tagColor);
			border-radius: 50%;
		}
	}
</style>
