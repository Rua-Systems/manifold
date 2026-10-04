<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import ConfirmDialog from '$lib/components/ConfirmDialog/ConfirmDialog.svelte';
	import Dialog from '$lib/components/Dialog/Dialog.svelte';
	import PageShell from '$lib/components/PageShell/PageShell.svelte';
	import { m } from '$lib/paraglide/messages.js';
	import { getNotifications } from '$lib/state/notifications.svelte';
	import { actionMessage, postAction } from '$lib/utils/actions';
	import { localizedHref } from '$lib/utils/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { untrack } from 'svelte';
	import { activeBasemap, type MapConfig } from '../map/config';
	import { MapController, type MapMode, type MapViewState } from '../map/controller';
	import type { MapFeatureView, MapGeometry } from '../map/geometry';
	import { loadMapView, saveMapView } from '../map/view';
	import { MAP_DEPENDENCY, NEW_NOTE_ID } from '../paths';
	import FeatureNotePanel from './FeatureNotePanel.svelte';
	import MapPanel from './MapPanel.svelte';
	import MapToolbar from './MapToolbar.svelte';
	import NotePicker from './NotePicker.svelte';

	interface Props {
		features: MapFeatureView[];
		notes: { id: string; title: string }[];
		/** The note the next drawn geometry is linked to, from `?attach=`. */
		attachNote: { id: string; title: string } | null;
		/** The note whose geometries the map opens on, from `?note=`. */
		focusNoteId: string | null;
		config: MapConfig;
		uploadMaxBytes: number;
	}

	let { features, notes, attachNote, focusNoteId, config, uploadMaxBytes }: Props = $props();

	type Panel =
		| { kind: 'pending'; geometry: MapGeometry; picking: boolean }
		| { kind: 'feature'; featureId: string };

	const notifications = getNotifications();

	let controller = $state.raw<MapController | null>(null);
	let mode = $state<MapMode>('select');
	let drawing = $state(false);
	let panel = $state<Panel | null>(null);
	let busy = $state(false);
	let attach = $state(untrack(() => attachNote));
	let deleteOpen = $state(false);
	let deleteId = $state('');
	let basemapsOpen = $state(false);
	let basemapId = $state(untrack(() => config.basemapId));

	const selected = $derived.by(() => {
		if (panel?.kind !== 'feature') {
			return null;
		}
		const id = panel.featureId;
		return features.find((item) => item.id === id) ?? null;
	});

	const selectedNoteFeatures = $derived(
		selected === null ? [] : features.filter((item) => item.noteId === selected.noteId)
	);

	/** Builds the map once; nothing read here may rebuild it, so it all runs untracked. */
	function createMap(target: HTMLElement) {
		return untrack(() => {
			const map = new MapController(target, {
				config,
				view: loadMapView() ?? { center: config.center, zoom: config.zoom },
				interactive: true,
				callbacks: {
					onselect: (id) => (id === null ? closePanel() : openFeature(id)),
					ondeleterequest: (id) => requestDelete(id),
					ondrawend: (geometry) => void finishDrawing(geometry),
					ondrawingchange: (value) => (drawing = value),
					onmodify: (id, geometry) => void saveGeometry(id, geometry),
					onviewchange: (view: MapViewState) => saveMapView(view)
				}
			});
			map.setFeatures(features);
			controller = map;

			if (focusNoteId !== null) {
				const ids = features
					.filter((item) => item.noteId === focusNoteId)
					.map((item) => item.id);
				if (ids.length > 0) {
					map.fit(ids, { animate: false });
					openFeature(ids[0]);
				}
			}

			return () => {
				controller = null;
				map.destroy();
			};
		});
	}

	$effect(() => {
		controller?.setFeatures(features);
	});

	$effect(() => {
		controller?.setMode(mode);
	});

	$effect(() => {
		controller?.select(panel?.kind === 'feature' ? panel.featureId : null);
	});

	function openFeature(id: string): void {
		panel = { kind: 'feature', featureId: id };
		controller?.showSketch(null);
	}

	function closePanel(): void {
		panel = null;
		controller?.showSketch(null);
	}

	function zoomTo(id: string): void {
		controller?.fit([id]);
		openFeature(id);
	}

	async function finishDrawing(geometry: MapGeometry): Promise<void> {
		// Drawing again is a deliberate choice once this geometry has a note.
		mode = 'select';
		if (attach !== null) {
			const target = attach.id;
			attach = null;
			await createFeature(geometry, target);
			await goto(localizedHref('/notes/map'), {
				replaceState: true,
				keepFocus: true,
				noScroll: true
			});
			return;
		}
		panel = { kind: 'pending', geometry, picking: false };
	}

	/** Links the geometry to a note, or to a new untitled one, and opens that note. */
	async function createFeature(geometry: MapGeometry, noteId: string): Promise<void> {
		busy = true;
		try {
			const result = await postAction('?/createFeature', {
				geometry: JSON.stringify(geometry),
				noteId
			});
			if (result.type === 'success' && typeof result.data?.feature === 'object') {
				const feature = result.data.feature as MapFeatureView;
				await invalidate(MAP_DEPENDENCY);
				openFeature(feature.id);
				return;
			}
			notifications.fault(actionMessage(result, m.map_save_failed()));
		} catch {
			notifications.fault(m.map_save_failed());
		} finally {
			busy = false;
		}
	}

	async function saveGeometry(id: string, geometry: MapGeometry): Promise<void> {
		const before = features.find((item) => item.id === id)?.geometry;
		try {
			const result = await postAction('?/updateFeature', {
				id,
				geometry: JSON.stringify(geometry)
			});
			if (result.type === 'success') {
				await invalidate(MAP_DEPENDENCY);
				return;
			}
			notifications.fault(actionMessage(result, m.map_save_failed()));
		} catch {
			notifications.fault(m.map_save_failed());
		}
		if (before !== undefined) {
			controller?.restoreGeometry(id, before);
		}
	}

	function requestDelete(id: string): void {
		deleteId = id;
		deleteOpen = true;
	}

	const deleteResult: SubmitFunction = () => {
		deleteOpen = false;
		return async ({ result, update }) => {
			if (result.type === 'success') {
				notifications.confirm(m.map_feature_deleted());
				if (panel?.kind === 'feature' && panel.featureId === deleteId) {
					closePanel();
				}
			}
			if (result.type === 'failure') {
				notifications.fault(actionMessage(result, m.map_save_failed()));
			}
			await update();
		};
	};

	function onTrashed(): void {
		closePanel();
		void invalidate(MAP_DEPENDENCY);
	}

	async function pickExisting(): Promise<void> {
		if (panel?.kind === 'pending') {
			panel = { ...panel, picking: true };
			// Titles may have changed since the page loaded.
			await invalidate(MAP_DEPENDENCY);
		}
	}

	function locate(): void {
		if (!('geolocation' in navigator)) {
			notifications.fault(m.map_locate_failed());
			return;
		}
		navigator.geolocation.getCurrentPosition(
			(position) =>
				controller?.centerOn([position.coords.longitude, position.coords.latitude], 16),
			() => notifications.fault(m.map_locate_failed()),
			{ enableHighAccuracy: true, timeout: 15_000 }
		);
	}

	/** Shows the basemap at once and keeps it for every map; a refused choice is undone. */
	async function chooseBasemap(id: string | null): Promise<void> {
		const previous = basemapId;
		basemapId = id;
		basemapsOpen = false;
		controller?.setBasemap(activeBasemap(config, id));
		try {
			const result = await postAction('?/basemap', { id: id ?? '' });
			if (result.type === 'success') {
				return;
			}
			notifications.fault(actionMessage(result, m.map_basemap_failed()));
		} catch {
			notifications.fault(m.map_basemap_failed());
		}
		basemapId = previous;
		controller?.setBasemap(activeBasemap(config, previous));
	}

	async function cancelAttach(): Promise<void> {
		attach = null;
		await goto(localizedHref('/notes/map'), {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	}

	function onKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape' && drawing) {
			event.preventDefault();
			controller?.cancelDrawing();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<PageShell fill title={m.map_title()} metaDescription={m.map_meta_description()}>
	<div class="workspace">
		<div class="stage">
			<div
				class="map"
				data-testid="map"
				data-feature-count={features.length}
				{@attach createMap}
			></div>
			<div class="tools">
				<MapToolbar
					{mode}
					{drawing}
					onmode={(value) => (mode = value)}
					onundo={() => controller?.undoVertex()}
					oncancel={() => controller?.cancelDrawing()}
					onlocate={locate}
					onbasemaps={() => (basemapsOpen = true)}
				/>
			</div>
			{#if attach !== null}
				<div class="attach" role="status">
					<p>{m.map_attach_notice({ title: attach.title || m.notes_untitled() })}</p>
					<button type="button" class="quiet" onclick={cancelAttach}
						>{m.common_cancel()}</button
					>
				</div>
			{/if}
		</div>
		{#if panel?.kind === 'pending'}
			<MapPanel title={m.map_pending_title()} onclose={closePanel}>
				{#if panel.picking}
					<NotePicker
						{notes}
						onpick={(id) =>
							panel?.kind === 'pending' && createFeature(panel.geometry, id)}
					/>
				{:else}
					<div class="choices">
						<p>{m.map_pending_text()}</p>
						<button
							type="button"
							class="primary"
							disabled={busy}
							onclick={() =>
								panel?.kind === 'pending' &&
								createFeature(panel.geometry, NEW_NOTE_ID)}
						>
							{m.notes_new()}
						</button>
						<button
							type="button"
							class="secondary"
							disabled={busy}
							onclick={pickExisting}
						>
							{m.map_link_existing()}
						</button>
					</div>
				{/if}
			</MapPanel>
		{:else if panel?.kind === 'feature' && selected !== null}
			<MapPanel title={m.map_feature_title()} onclose={closePanel}>
				{#snippet actions()}
					<a class="quiet" href={localizedHref(`/notes/${selected?.noteId}`)}>
						{m.map_open_page()}
					</a>
				{/snippet}
				{#key selected.noteId}
					<FeatureNotePanel
						feature={selected}
						noteFeatures={selectedNoteFeatures}
						{uploadMaxBytes}
						onzoom={zoomTo}
						ondelete={requestDelete}
						ontrashed={onTrashed}
					/>
				{/key}
			</MapPanel>
		{/if}
	</div>
</PageShell>

<ConfirmDialog
	bind:open={deleteOpen}
	id="featureDelete"
	title={m.map_delete_title()}
	message={m.map_delete_confirm()}
	action="?/deleteFeature"
	fields={{ id: deleteId }}
	confirmLabel={m.common_delete()}
	onresult={deleteResult}
/>
<Dialog bind:open={basemapsOpen} id="mapBasemaps" title={m.map_basemaps_title()}>
	<fieldset class="basemaps">
		<legend class="visually-hidden">{m.map_basemaps_title()}</legend>
		{#each config.basemaps as basemap (basemap.id ?? 'instance')}
			<label class="basemap">
				<input
					type="radio"
					name="basemap"
					checked={basemap.id === basemapId}
					onchange={() => chooseBasemap(basemap.id)}
				/>
				<span>{basemap.name || m.map_basemap_standard()}</span>
			</label>
		{/each}
	</fieldset>
	<a class="quiet manage" href={localizedHref('/settings/map')}>{m.map_basemaps_manage()}</a>
</Dialog>

<style lang="scss">
	@use '../../../../styles/colors' as clr;
	@use '../../../../styles/forms' as forms;
	@use '../../../../styles/variables' as vars;

	// Exactly the viewport: the panel scrolls inside it rather than growing the page.
	.workspace {
		display: flex;
		height: 100dvh;
		min-height: 0;
	}

	.stage {
		position: relative;
		display: flex;
		flex: 1;
		min-width: 0;

		> .map {
			flex: 1;
			min-height: 0;
			background-color: clr.$surfaceHoverColor;

			// The zoom buttons move out of the toolbar's corner.
			:global(.ol-zoom) {
				top: auto;
				bottom: 0.5em;
				left: 0.5em;
			}

			// OpenLayers renders its controls; they follow the theme through its variables.
			--ol-background-color: var(--color-surface);
			--ol-foreground-color: var(--color-text-primary);
			--ol-subtle-foreground-color: var(--color-text-secondary);
			--ol-partial-background-color: var(--color-panel);
			--ol-subtle-background-color: var(--color-border-subtle);
		}

		> .tools {
			position: absolute;
			top: 1rem;
			left: 1rem;
			z-index: 10;
			max-width: calc(100% - 2rem);
		}

		> .attach {
			position: absolute;
			top: 5rem;
			left: 50%;
			z-index: 10;
			display: flex;
			align-items: center;
			gap: 0.8rem;
			max-width: calc(100% - 2rem);
			padding: 0.3rem 0.4rem 0.3rem 0.9rem;
			background-color: clr.$panelColor;
			border: 1px solid clr.$accentMutedColor;
			border-radius: vars.$radius;
			transform: translateX(-50%);

			> p {
				font-size: 0.8rem;
				color: clr.$textPrimaryColor;
			}
		}
	}

	.choices {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;

		> p {
			font-size: 0.86rem;
		}
	}

	.primary {
		@include forms.primaryButton;
	}

	.secondary {
		@include forms.primaryButton;
		border-color: clr.$borderSubtleColor;
	}

	.basemaps {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		margin: 0 0 1rem;
		padding: 0;
		border: 0;

		> .basemap {
			display: flex;
			align-items: center;
			gap: 0.7rem;
			min-height: vars.$touchTarget;
			padding: 0 0.7rem;
			font-size: 0.86rem;
			color: clr.$textPrimaryColor;
			border: 1px solid clr.$borderSubtleColor;
			border-radius: vars.$radius;
			cursor: pointer;

			&:has(input:checked) {
				border-color: clr.$accentColor;
				background-color: clr.$accentWashColor;
			}

			> input {
				width: 1.1rem;
				height: 1.1rem;
				accent-color: clr.$accentColor;
			}
		}
	}

	.manage {
		text-decoration: none;
	}

	.quiet {
		@include forms.quietButton;
		text-decoration: none;
	}

	// Phones: the map fills the screen below the top bar, with the toolbar along the bottom.
	@media (max-width: vars.$mobileMax) {
		.workspace {
			height: calc(100dvh - 4.55rem - env(safe-area-inset-top));
		}

		.stage {
			flex-direction: column;

			> .tools {
				position: static;
				z-index: 31;
				display: flex;
				flex: none;
				align-items: center;
				max-width: none;
				height: calc(#{vars.$mapToolbarHeight} + env(safe-area-inset-bottom));
				padding-bottom: env(safe-area-inset-bottom);
				background-color: clr.$panelColor;
				border-top: 1px solid clr.$borderSubtleColor;
			}

			> .attach {
				top: 1rem;
			}
		}
	}
</style>
