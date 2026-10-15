<script lang="ts">
	import DataSourcesPage from '$lib/modules/datasources/components/DataSourcesPage.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<DataSourcesPage sources={data.sources} filter={data.filter} />
