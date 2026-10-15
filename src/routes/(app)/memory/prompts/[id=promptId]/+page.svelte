<script lang="ts">
	import PromptPage from '$lib/modules/memory/prompts/components/PromptPage.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

{#key data.prompt?.id ?? 'new'}
	<PromptPage prompt={data.prompt} categories={data.categories} tags={data.tags} {form} />
{/key}
