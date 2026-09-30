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
	<rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
	<circle cx="12" cy="12" r="3.2" />
	<path d="M12 8.8V7.5M12 16.5v-1.3M15.2 12h1.3M7.5 12h1.3" />
</svg>

<style>
	svg {
		display: block;
		width: var(--icon-size);
		height: var(--icon-size);
	}
</style>
