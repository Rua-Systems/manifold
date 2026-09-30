<script lang="ts">
	import MapNotesPage from '$lib/modules/notes/components/MapNotesPage.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<MapNotesPage
	features={data.features}
	notes={data.notes}
	attachNote={data.attachNote}
	focusNoteId={data.focusNoteId}
	config={data.map}
	uploadMaxBytes={data.uploadMaxBytes}
/>
