<script lang="ts">
	import VaultPage from '$lib/modules/vault/components/VaultPage.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const revealed = $derived(
		form !== null &&
			form !== undefined &&
			'value' in form &&
			typeof form.value === 'string' &&
			typeof form.id === 'string'
			? { id: form.id, value: form.value }
			: null
	);
	const stepUpNeeded = $derived(
		form !== null && form !== undefined && 'stepUp' in form && form.stepUp === true
	);
</script>

<VaultPage secrets={data.secrets} {revealed} {stepUpNeeded} />
