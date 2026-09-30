<script lang="ts">
	import { page } from '$app/state';
	import NavigationButton from '$lib/components/NavigationButton/NavigationButton.svelte';
	import Notifications from '$lib/components/Notifications/Notifications.svelte';
	import { PRODUCT_NAME } from '$lib/constants';
	import { baseLocale, locales, localizeUrl } from '$lib/paraglide/runtime.js';
	import { setNotifications } from '$lib/state/notifications.svelte';
	import { setThemeState } from '$lib/state/theme.svelte';
	import '@fontsource/space-mono/400.css';
	import '@fontsource/space-mono/700.css';
	import '../styles/styles.scss';
	import { onMount, untrack } from 'svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	setNotifications();
	const theme = setThemeState(untrack(() => data.theme));

	const canonicalUrl = $derived(new URL(page.url.pathname, page.url.origin));

	onMount(() => {
		theme.syncFromDocument();
	});
</script>

<svelte:head>
	<meta name="generator" content={PRODUCT_NAME} />
	{#each locales as locale (locale)}
		<link rel="alternate" hreflang={locale} href={localizeUrl(canonicalUrl, { locale }).href} />
	{/each}
	<link
		rel="alternate"
		hreflang="x-default"
		href={localizeUrl(canonicalUrl, { locale: baseLocale }).href}
	/>
</svelte:head>

<NavigationButton />
<div class="shell">
	<main class="main">
		{@render children()}
	</main>
</div>
<Notifications />

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
