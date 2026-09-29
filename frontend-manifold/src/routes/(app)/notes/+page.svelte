<script lang="ts">
	import NotesList from '$lib/modules/notes/components/NotesList.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<NotesList notes={data.notes} query={data.query} />
