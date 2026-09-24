<script lang="ts">
	import NavigationButton from '$lib/components/NavigationButton/NavigationButton.svelte';
	import Notifications from '$lib/components/Notifications/Notifications.svelte';
	import { setNotifications } from '$lib/state/notifications.svelte';
	import { setSidebarState } from '$lib/state/sidebar.svelte';
	import '../styles/styles.scss';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	setNotifications();
	setSidebarState();
</script>

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
