<script lang="ts">
	import MemoryPage from '$lib/modules/memory/components/MemoryPage.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

{#key data.memory?.id ?? 'new'}
	<MemoryPage
		memory={data.memory}
		revisions={data.revisions}
		preview={data.preview}
		categories={data.categories}
		tags={data.tags}
		newCategoryId={data.newCategoryId}
		{form}
	/>
{/key}
