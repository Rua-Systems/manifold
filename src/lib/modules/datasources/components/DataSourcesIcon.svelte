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
	<ellipse cx="11" cy="5.5" rx="7" ry="2.5" />
	<path d="M4 5.5v6c0 1.4 3.1 2.5 7 2.5" />
	<path d="M18 5.5V10" />
	<path d="M4 11.5v6c0 1.4 3.1 2.5 7 2.5" />
	<circle cx="17.5" cy="16.5" r="3.5" />
	<path d="M17.5 14.8v1.7l1.1 1.1" />
</svg>

<style>
	svg {
		display: block;
		width: var(--icon-size);
		height: var(--icon-size);
	}
</style>
