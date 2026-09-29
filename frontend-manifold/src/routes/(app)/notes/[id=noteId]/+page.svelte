<script lang="ts">
	import { goto } from '$app/navigation';
	import NoteEditorPage from '$lib/modules/notes/components/NoteEditorPage.svelte';
	import { localizedHref } from '$lib/utils/navigation';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// A new note keeps its editing session when its first save moves the page to the note's id.
	// This lives in the page component, which stays mounted across navigations within the route.
	let created = $state<{ id: string; draftKey: string } | null>(null);

	const editorKey = $derived.by(() => {
		if (created !== null && data.note?.id === created.id) {
			return created.draftKey;
		}
		return data.draftKey;
	});

	async function oncreated(id: string): Promise<void> {
		created = { id, draftKey: data.draftKey };
		await goto(localizedHref(`/notes/${id}`), {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}
</script>

{#key editorKey}
	<NoteEditorPage
		note={data.note}
		revisions={data.revisions}
		preview={data.preview}
		uploadMaxBytes={data.uploadMaxBytes}
		{oncreated}
	/>
{/key}
