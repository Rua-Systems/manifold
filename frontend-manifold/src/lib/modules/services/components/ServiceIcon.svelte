<script lang="ts">
	interface Props {
		iconSrc: string | null;
		initial: string;
		size?: string;
	}

	let { iconSrc, initial, size = '2.4rem' }: Props = $props();
</script>

<span class="service-icon" style="--size: {size}">
	{#if iconSrc !== null}
		<img src={iconSrc} alt="" loading="lazy" />
	{:else}
		<span class="letter" aria-hidden="true">{initial}</span>
	{/if}
</span>

<style lang="scss">
	@use '../../../../styles/colors' as clr;
	@use '../../../../styles/variables' as vars;

	.service-icon {
		display: flex;
		flex: none;
		align-items: center;
		justify-content: center;
		width: var(--size);
		height: var(--size);
		overflow: hidden;
		background-color: clr.$surfaceHoverColor;
		border: 1px solid clr.$borderSubtleColor;
		border-radius: vars.$radius;

		> img {
			width: 80%;
			height: 80%;
			object-fit: contain;
		}

		> .letter {
			display: flex;
			align-items: center;
			justify-content: center;
			width: 100%;
			height: 100%;
			font-size: calc(var(--size) * 0.42);
			font-weight: 700;
			color: clr.$accentColor;
			background-color: clr.$accentWashColor;
		}
	}
</style>
