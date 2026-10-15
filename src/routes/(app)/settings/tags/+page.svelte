<script lang="ts">
	import TagsPage from '$lib/components/Tags/TagsPage.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<TagsPage tags={data.tags} {form} />
