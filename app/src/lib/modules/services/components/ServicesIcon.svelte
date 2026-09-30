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
	<rect x="3.5" y="3.5" width="7" height="7" rx="1.2" />
	<rect x="13.5" y="3.5" width="7" height="7" rx="1.2" />
	<rect x="3.5" y="13.5" width="7" height="7" rx="1.2" />
	<path d="M17 13.5v7M13.5 17h7" />
</svg>

<style>
	svg {
		display: block;
		width: var(--icon-size);
		height: var(--icon-size);
	}
</style>
