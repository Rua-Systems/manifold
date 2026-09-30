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
	<circle cx="9" cy="6" r="1.2" /><circle cx="15" cy="6" r="1.2" /><circle
		cx="9"
		cy="12"
		r="1.2"
	/><circle cx="15" cy="12" r="1.2" /><circle cx="9" cy="18" r="1.2" /><circle
		cx="15"
		cy="18"
		r="1.2"
	/>
</svg>

<style>
	svg {
		display: block;
		width: var(--icon-size);
		height: var(--icon-size);
	}
</style>
