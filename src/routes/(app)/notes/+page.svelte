<script lang="ts">
	import NotesList from '$lib/modules/notes/components/NotesList.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<NotesList
	notes={data.notes}
	query={data.query}
	folder={data.folder}
	path={data.path}
	folders={data.folders}
	allFolders={data.allFolders}
	{form}
/>
