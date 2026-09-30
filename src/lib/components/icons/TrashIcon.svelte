<script lang="ts">
	interface Props {
		size?: string;
	}

	let { size = '1.1rem' }: Props = $props();
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
	<path d="M4 7h16" /><path d="M9 7V4.5h6V7" /><path d="M6.5 7l1 13h9l1-13" /><path
		d="M10 11v5M14 11v5"
	/>
</svg>

<style>
	svg {
		display: block;
		width: var(--icon-size);
		height: var(--icon-size);
	}
</style>
