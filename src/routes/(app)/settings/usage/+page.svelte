<script lang="ts">
	import PageShell from '$lib/components/PageShell/PageShell.svelte';
	import SettingsNav from '$lib/components/SettingsNav/SettingsNav.svelte';
	import UsageReport from '$lib/components/Usage/UsageReport.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<PageShell
	title={m.usage_title()}
	sigil={m.account_sigil()}
	metaDescription={m.usage_meta_description()}
>
	<SettingsNav />
	<UsageReport report={data.report} />
</PageShell>
