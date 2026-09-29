<script lang="ts">
	import PageShell from '$lib/components/PageShell/PageShell.svelte';
	import { m } from '$lib/paraglide/messages.js';
</script>

<PageShell
	title={m.services_title()}
	sigil={m.services_sigil()}
	metaDescription={m.services_meta_description()}
>
	<p class="empty">{m.services_empty()}</p>
</PageShell>

<style lang="scss">
	@use '../../../styles/colors' as clr;

	.empty {
		font-size: 0.9rem;
		color: clr.$textMutedColor;
	}
</style>
