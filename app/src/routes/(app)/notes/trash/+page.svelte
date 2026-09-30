<script lang="ts">
	import NotesTrash from '$lib/modules/notes/components/NotesTrash.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<NotesTrash notes={data.notes} retentionDays={data.retentionDays} />
