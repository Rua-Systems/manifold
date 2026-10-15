<script lang="ts">
	import Dialog from '$lib/components/Dialog/Dialog.svelte';
	import MoveForm from '$lib/components/Folders/MoveForm.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { getNotifications } from '$lib/state/notifications.svelte';
	import type { FolderOption } from '$lib/types/folders';
	import FolderInputIcon from '@lucide/svelte/icons/folder-input';

	interface Props {
		/** The note's folder, null at the top level. */
		folderId: string | null;
		folders: FolderOption[];
		/** The note's title, for the dialog's heading. */
		title: string;
		/** Why the last move was refused, empty after a success. */
		serverMessage: string;
	}

	let { folderId, folders, title, serverMessage }: Props = $props();

	const notifications = getNotifications();

	let open = $state(false);
	// Bumped on every opening, so the form starts from the note's current folder.
	let opened = $state(0);

	function show(): void {
		opened += 1;
		open = true;
	}

	function onsaved(message: string): void {
		open = false;
		notifications.confirm(message);
	}
</script>

<button
	type="button"
	class="tool"
	aria-label={m.notes_move()}
	title={m.notes_move()}
	onclick={show}
>
	<FolderInputIcon size={18} />
</button>

<Dialog bind:open id="noteMoveFolder" title={m.notes_move_title({ name: title })}>
	{#key opened}
		<MoveForm
			action="?/moveNote"
			fields={{}}
			{folders}
			rootLabel={m.notes_title()}
			current={folderId}
			moving={null}
			{serverMessage}
			{onsaved}
		/>
	{/key}
</Dialog>

<style lang="scss">
	@use '../../../../styles/forms' as forms;

	.tool {
		@include forms.framedToolButton;
	}
</style>
