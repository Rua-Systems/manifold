<script lang="ts">
	import ServicesPage from '$lib/modules/services/components/ServicesPage.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<ServicesPage services={data.services} uploadMaxBytes={data.uploadMaxBytes} {form} />
