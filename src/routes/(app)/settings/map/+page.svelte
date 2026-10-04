<script lang="ts">
	import BasemapsPage from '$lib/modules/notes/components/BasemapsPage.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<BasemapsPage basemaps={data.basemaps} standardUrl={data.standardUrl} {form} />
