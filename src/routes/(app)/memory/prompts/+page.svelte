<script lang="ts">
	import PromptsPage from '$lib/modules/memory/prompts/components/PromptsPage.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<PromptsPage
	prompts={data.prompts}
	categories={data.categories}
	tags={data.tags}
	filter={data.filter}
/>
