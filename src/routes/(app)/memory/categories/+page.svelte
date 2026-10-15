<script lang="ts">
	import CategoriesPage from '$lib/modules/memory/components/CategoriesPage.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<CategoriesPage tree={data.tree} {form} />
