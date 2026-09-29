<script lang="ts">
	import { page } from '$app/state';
	import PageShell from '$lib/components/PageShell/PageShell.svelte';
	import StepUpForm from '$lib/components/StepUp/StepUpForm.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<PageShell title={m.step_up_title()} sigil={m.account_sigil()} metaDescription={m.step_up_title()}>
	<div class="form">
		<StepUpForm
			id="stepUpPage"
			twoFactorEnabled={page.data.user?.twoFactorEnabled === true}
			redirectTo={data.redirectTo}
			serverErrors={form?.errors ?? {}}
			serverMessage={form?.message ?? ''}
		/>
	</div>
</PageShell>

<style lang="scss">
	.form {
		max-width: 26rem;
	}
</style>
