<script lang="ts">
	interface Props {
		size?: string;
	}

	let { size = '1.2rem' }: Props = $props();
</script>

<svg
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.5"
	stroke-linecap="round"
	stroke-linejoin="round"
	style="--icon-size: {size}"
	aria-hidden="true"
>
	<rect x="4" y="4" width="6.5" height="6.5" rx="1" />
	<rect x="13.5" y="4" width="6.5" height="6.5" rx="1" />
	<rect x="4" y="13.5" width="6.5" height="6.5" rx="1" />
	<rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1" />
</svg>

<style>
	svg {
		display: block;
		width: var(--icon-size);
		height: var(--icon-size);
	}
</style>
