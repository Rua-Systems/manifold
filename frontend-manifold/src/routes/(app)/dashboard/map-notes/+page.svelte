<script lang="ts">
	import { page } from '$app/state';
	import Dropdown from '$lib/components/Dropdown/Dropdown.svelte';
	import PageShell from '$lib/components/PageShell/PageShell.svelte';
	import { DASHBOARD_ASIDE_LINKS } from '$lib/config/dashboard';

	function currentMarker(href: string): 'page' | undefined {
		if (page.url.pathname === href) {
			return 'page';
		}
		return undefined;
	}
</script>

<PageShell
	title="Map Notes"
	sigil="Dashboard"
	description="Placeholder. A short line describing what this view is for."
>
	{#snippet actions()}
		<Dropdown label="Go to" ariaLabel="Go to dashboard section">
			{#each DASHBOARD_ASIDE_LINKS as link (link.href)}
				<a href={link.href} aria-current={currentMarker(link.href)}>{link.label}</a>
			{/each}
		</Dropdown>
		<button type="button" class="action">New Note</button>
	{/snippet}
	<p class="placeholder">Placeholder. Fill this in.</p>
</PageShell>

<style lang="scss">
	@use '../../../../styles/colors' as clr;
	@use '../../../../styles/forms' as forms;

	.action {
		@include forms.primaryButton;
	}

	.placeholder {
		font-size: 0.9rem;
		color: clr.$textMutedColor;
	}
</style>
