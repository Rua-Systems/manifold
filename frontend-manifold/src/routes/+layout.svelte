<script lang="ts">
	import favicon from '$lib/assets/favicon.png';
	import NavigationButton from '$lib/components/NavigationButton/NavigationButton.svelte';
	import '../styles/styles.scss';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" type="image/png" href={favicon} />
</svelte:head>

<NavigationButton></NavigationButton>
<div class="shell">
	<main class="main">
		{@render children()}
	</main>
</div>

<style lang="scss">
	.shell {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;

		> .main {
			display: flex;
			flex: 1;
		}
	}
</style>
