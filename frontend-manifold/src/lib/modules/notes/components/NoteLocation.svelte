<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import { localizedHref } from '$lib/utils/navigation';
	import { untrack } from 'svelte';
	import type { MapConfig } from '../map/config';
	import { MapController } from '../map/controller';
	import type { MapFeatureView } from '../map/geometry';

	interface Props {
		noteId: string;
		features: MapFeatureView[];
		config: MapConfig;
	}

	let { noteId, features, config }: Props = $props();

	/** A still map of the note's geometries; "Show on map" is where they are explored. */
	function createMap(target: HTMLElement) {
		return untrack(() => {
			const map = new MapController(target, {
				config,
				view: { center: config.center, zoom: config.zoom },
				interactive: false
			});
			map.setFeatures(features);
			map.fit(undefined, { padding: 24, animate: false });
			return () => map.destroy();
		});
	}
</script>

<section class="location" aria-labelledby="noteLocationTitle">
	<h2 id="noteLocationTitle">{m.map_location_title()}</h2>
	{#if features.length > 0}
		{#key features}
			<div class="map" data-testid="note-location-map" {@attach createMap}></div>
		{/key}
	{:else}
		<p class="empty">{m.map_location_empty()}</p>
	{/if}
	<div class="actions">
		{#if features.length > 0}
			<a class="quiet" href={localizedHref(`/notes/map?note=${noteId}`)}
				>{m.map_show_on_map()}</a
			>
		{/if}
		<a class="quiet" href={localizedHref(`/notes/map?attach=${noteId}`)}
			>{m.map_add_location()}</a
		>
	</div>
</section>

<style lang="scss">
	@use '../../../../styles/colors' as clr;
	@use '../../../../styles/forms' as forms;
	@use '../../../../styles/variables' as vars;

	.location {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin-top: 1.5rem;
		padding-top: 1.2rem;
		border-top: 1px solid clr.$borderSubtleColor;

		> h2 {
			font-size: 0.72rem;
			font-weight: 400;
			letter-spacing: 0.2em;
			text-transform: uppercase;
			color: clr.$textSecondaryColor;
		}

		> .map {
			height: 14rem;
			overflow: hidden;
			background-color: clr.$surfaceHoverColor;
			border: 1px solid clr.$borderSubtleColor;
			border-radius: vars.$radius;
		}

		> .empty {
			font-size: 0.82rem;
			color: clr.$textMutedColor;
		}

		> .actions {
			display: flex;
			flex-wrap: wrap;
			gap: 1.2rem;
		}
	}

	.quiet {
		@include forms.mutedLink;
	}
</style>
