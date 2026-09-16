<script lang="ts">
	import PageShell from '$lib/components/PageShell/PageShell.svelte';
</script>

<PageShell
	title="Settings"
	sigil="Account"
	description="Placeholder. A short line describing what this view is for."
>
	<p class="placeholder">Placeholder. Fill this in.</p>
</PageShell>

<style lang="scss">
	@use '../../../styles/colors' as clr;

	.placeholder {
		font-size: 0.9rem;
		color: clr.$textMutedColor;
	}
</style>
