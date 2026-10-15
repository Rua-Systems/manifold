<script lang="ts">
	import { goto } from '$app/navigation';
	import NoteEditorPage from '$lib/modules/notes/components/NoteEditorPage.svelte';
	import NoteFolderMove from '$lib/modules/notes/components/NoteFolderMove.svelte';
	import NoteLocation from '$lib/modules/notes/components/NoteLocation.svelte';
	import NoteTokens from '$lib/modules/notes/components/NoteTokens.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { localizedHref } from '$lib/utils/navigation';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	/** Why the last move into a folder was refused; the other actions report on their own. */
	const moveMessage = $derived.by(() => {
		if (form === null || form === undefined || !('action' in form)) {
			return '';
		}
		if (form.action !== 'moveNote' || form.success) {
			return '';
		}
		return form.message;
	});

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
		path={data.path}
		newNoteFolderId={data.newNoteFolderId}
		{oncreated}
	>
		{#snippet tools()}
			{#if data.note !== null}
				<NoteFolderMove
					folderId={data.note.folderId}
					folders={data.folders}
					title={data.note.title || m.notes_untitled()}
					serverMessage={moveMessage}
				/>
				<NoteTokens noteId={data.note.id} tokens={data.tokens} />
			{/if}
		{/snippet}
		{#if data.note !== null}
			<NoteLocation noteId={data.note.id} features={data.features} config={data.map} />
		{/if}
	</NoteEditorPage>
{/key}
