<script lang="ts">
	interface Props {
		size?: string;
	}

	let { size = '1.4rem' }: Props = $props();
</script>

<svg
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.5"
	stroke-linecap="round"
	style="--icon-size: {size}"
	aria-hidden="true"
>
	<path d="M6 6L18 18" />
	<path d="M18 6L6 18" />
</svg>

<style>
	svg {
		display: block;
		width: var(--icon-size);
		height: var(--icon-size);
	}
</style>
