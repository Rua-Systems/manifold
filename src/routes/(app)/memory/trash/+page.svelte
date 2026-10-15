<script lang="ts">
	import MemoryTrash from '$lib/modules/memory/components/MemoryTrash.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<MemoryTrash
	memories={data.memories}
	categories={data.categories}
	retentionDays={data.retentionDays}
/>
