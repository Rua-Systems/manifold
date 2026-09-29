<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { getNotifications } from '$lib/state/notifications.svelte';
	import { postAction } from '$lib/utils/actions';
	import { untrack } from 'svelte';
	import type { FeatureKind, MapFeatureView } from '../map/geometry';
	import type { NoteData } from '../types';
	import NoteEditorPage from './NoteEditorPage.svelte';

	interface Props {
		feature: MapFeatureView;
		/** Every geometry of the same note, this one included. */
		noteFeatures: MapFeatureView[];
		uploadMaxBytes: number;
		onzoom: (id: string) => void;
		/** Asks to unlink and delete this geometry; the note stays. */
		ondelete: (id: string) => void;
		ontrashed: () => void;
	}

	let { feature, noteFeatures, uploadMaxBytes, onzoom, ondelete, ontrashed }: Props = $props();

	const KIND_LABELS: Record<FeatureKind, () => string> = {
		point: m.map_kind_point,
		line: m.map_kind_line,
		polygon: m.map_kind_polygon
	};

	const notifications = getNotifications();

	let data = $state.raw<NoteData | null>(null);

	const others = $derived(noteFeatures.filter((item) => item.id !== feature.id));

	/** The note through the map page's `openNote` action; the map never leaves its page. */
	async function load(revision: number | null): Promise<void> {
		const fields: Record<string, string> = { id: feature.noteId };
		if (revision !== null) {
			fields.revision = String(revision);
		}
		try {
			const result = await postAction('?/openNote', fields);
			if (result.type === 'success' && result.data !== undefined) {
				data = result.data as unknown as NoteData;
				return;
			}
		} catch {
			// Reported below, like a refused request.
		}
		notifications.fault(m.map_note_failed());
	}

	$effect(() => {
		untrack(() => void load(null));
	});
</script>

<section class="geometry" aria-label={m.map_geometry()}>
	<div class="current">
		<p>{KIND_LABELS[feature.kind]()}</p>
		<button type="button" class="danger" onclick={() => ondelete(feature.id)}>
			{m.map_unlink_delete()}
		</button>
	</div>
	{#if others.length > 0}
		<h3>{m.map_other_locations()}</h3>
		<ul>
			{#each others as other, index (other.id)}
				<li>
					<span>{KIND_LABELS[other.kind]()} {index + 1}</span>
					<button type="button" class="quiet" onclick={() => onzoom(other.id)}>
						{m.map_zoom_to()}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</section>

{#if data !== null}
	<NoteEditorPage
		note={data.note}
		revisions={data.revisions}
		preview={data.preview}
		{uploadMaxBytes}
		host={{ load, ontrashed }}
	/>
{:else}
	<p class="loading">{m.map_note_loading()}</p>
{/if}

<style lang="scss">
	@use '../../../../styles/colors' as clr;
	@use '../../../../styles/forms' as forms;

	.geometry {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1.2rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid clr.$borderMutedColor;

		> .current {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			justify-content: space-between;
			gap: 0.5rem;

			> p {
				font-size: 0.72rem;
				letter-spacing: 0.16em;
				text-transform: uppercase;
				color: clr.$textSecondaryColor;
			}
		}

		> h3 {
			margin-top: 0.4rem;
			font-size: 0.66rem;
			font-weight: 400;
			letter-spacing: 0.16em;
			text-transform: uppercase;
			color: clr.$textMutedColor;
		}

		> ul {
			display: flex;
			flex-direction: column;
			margin: 0;
			padding: 0;
			list-style: none;

			> li {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 0.5rem;
				font-size: 0.82rem;
				color: clr.$textSecondaryColor;
			}
		}
	}

	.quiet {
		@include forms.quietButton;
	}

	.danger {
		@include forms.quietButton;

		&:hover:not(:disabled) {
			color: clr.$errorColor;
		}
	}

	.loading {
		font-size: 0.82rem;
		color: clr.$textMutedColor;
	}
</style>
