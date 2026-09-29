<script lang="ts">
	import PageShell from '$lib/components/PageShell/PageShell.svelte';
	import { m } from '$lib/paraglide/messages.js';
</script>

<PageShell
	title={m.settings_title()}
	sigil={m.account_sigil()}
	description={m.page_placeholder_description()}
	metaDescription={m.settings_meta_description()}
>
	<p class="placeholder">{m.page_placeholder_body()}</p>
</PageShell>

<style lang="scss">
	@use '../../../styles/colors' as clr;

	.placeholder {
		font-size: 0.9rem;
		color: clr.$textMutedColor;
	}
</style>
