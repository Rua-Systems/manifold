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
	<path d="M12 21c4.7-4.4 7-7.9 7-10.8C19 6.2 15.9 3 12 3S5 6.2 5 10.2c0 2.9 2.3 6.4 7 10.8z" />
	<circle cx="12" cy="10" r="2.6" />
</svg>

<style>
	svg {
		display: block;
		width: var(--icon-size);
		height: var(--icon-size);
	}
</style>
