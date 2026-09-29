<script lang="ts">
	import { page } from '$app/state';
	import Dropdown from '$lib/components/Dropdown/Dropdown.svelte';
	import PageShell from '$lib/components/PageShell/PageShell.svelte';
	import { DASHBOARD_ASIDE_LINKS } from '$lib/config/dashboard';
	import { m } from '$lib/paraglide/messages.js';
	import { currentMarker, localizedHref } from '$lib/utils/navigation';
</script>

<PageShell
	title={m.dashboard_map_notes()}
	sigil={m.dashboard_title()}
	description={m.page_placeholder_description()}
	metaDescription={m.map_notes_meta_description()}
>
	{#snippet actions()}
		<Dropdown label={m.map_notes_go_to()} ariaLabel={m.map_notes_go_to_label()}>
			{#each DASHBOARD_ASIDE_LINKS as link (link.href)}
				<a
					href={localizedHref(link.href)}
					aria-current={currentMarker(page.url, link.href)}
				>
					{link.label()}
				</a>
			{/each}
		</Dropdown>
		<button type="button" class="action">{m.map_notes_new()}</button>
	{/snippet}
	<p class="placeholder">{m.page_placeholder_body()}</p>
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
