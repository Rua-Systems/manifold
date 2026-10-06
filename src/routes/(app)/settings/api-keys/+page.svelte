<script lang="ts">
	import ApiKeyForm from '$lib/components/ApiKeys/ApiKeyForm.svelte';
	import ApiKeyList from '$lib/components/ApiKeys/ApiKeyList.svelte';
	import NewApiKey from '$lib/components/ApiKeys/NewApiKey.svelte';
	import PageShell from '$lib/components/PageShell/PageShell.svelte';
	import SettingsNav from '$lib/components/SettingsNav/SettingsNav.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import type { FieldErrors } from '$lib/types/validation';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const createErrors: FieldErrors = $derived.by(() => {
		if (form !== null && form !== undefined && 'form' in form && form.form === 'create') {
			return (form.errors as FieldErrors | undefined) ?? {};
		}
		return {};
	});
	const newKey = $derived(
		form !== null && form !== undefined && 'key' in form && typeof form.key === 'string'
			? form.key
			: null
	);
	const savedToVault = $derived(
		form !== null && form !== undefined && 'vault' in form && form.vault === true
	);
	const stepUpNeeded = $derived(
		form !== null && form !== undefined && 'stepUp' in form && form.stepUp === true
	);
</script>

<PageShell
	title={m.api_keys_title()}
	sigil={m.account_sigil()}
	metaDescription={m.api_keys_meta_description()}
>
	<SettingsNav />
	<section class="section" aria-labelledby="apiKeyNewHeading">
		<h2 id="apiKeyNewHeading">{m.api_keys_new()}</h2>
		{#if newKey !== null}
			<NewApiKey apiKey={newKey} {savedToVault} />
		{/if}
		<ApiKeyForm errors={createErrors} {stepUpNeeded} />
	</section>
	<section class="section" aria-labelledby="apiKeyListHeading">
		<h2 id="apiKeyListHeading">{m.api_keys_title()}</h2>
		<p class="lead">{m.api_keys_lead()}</p>
		<ApiKeyList keys={data.keys} copies={data.copies} />
	</section>
</PageShell>

<style lang="scss">
	@use '../../../../styles/colors' as clr;

	.section {
		display: flex;
		flex-direction: column;
		gap: 1.2rem;
		max-width: 48rem;
		margin-bottom: 2.6rem;

		> h2 {
			display: flex;
			align-items: center;
			gap: 0.9rem;
			font-size: 0.7rem;
			letter-spacing: 0.24em;
			text-transform: uppercase;
			color: clr.$accentColor;

			&::after {
				content: '';
				flex: 1;
				height: 1px;
				background-color: clr.$borderSubtleColor;
			}
		}

		> .lead {
			font-size: 0.82rem;
			color: clr.$textSecondaryColor;
		}
	}
</style>
