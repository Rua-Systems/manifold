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
	<path d="M6 3.5h8.5L19 8v12.5H6z" />
	<path d="M14 3.5V8h5" />
	<path d="M9 12h7M9 15.5h7M9 19h4" />
</svg>

<style>
	svg {
		display: block;
		width: var(--icon-size);
		height: var(--icon-size);
	}
</style>
