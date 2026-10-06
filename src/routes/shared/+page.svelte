<script lang="ts">
	import SharedNotePage from '$lib/modules/notes/components/SharedNotePage.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<SharedNotePage shared={data.shared} {form} />
