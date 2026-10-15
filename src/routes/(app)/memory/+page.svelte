<script lang="ts">
	import MemoriesPage from '$lib/modules/memory/components/MemoriesPage.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<MemoriesPage
	memories={data.memories}
	tree={data.tree}
	categories={data.categories}
	tags={data.tags}
	filter={data.filter}
/>
