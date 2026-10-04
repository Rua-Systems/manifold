import { Feature } from 'ol';
import OlMap from 'ol/Map.js';
import View from 'ol/View.js';
import { defaults as defaultControls } from 'ol/control/defaults.js';
import type { EventsKey } from 'ol/events.js';
import { createEmpty, extend, isEmpty } from 'ol/extent.js';
import type { Geometry } from 'ol/geom.js';
import Draw from 'ol/interaction/Draw.js';
import Modify from 'ol/interaction/Modify.js';
import Snap from 'ol/interaction/Snap.js';
import type TileLayer from 'ol/layer/Tile.js';
import VectorLayer from 'ol/layer/Vector.js';
import { unByKey } from 'ol/Observable.js';
import { fromLonLat, toLonLat } from 'ol/proj.js';
import VectorSource from 'ol/source/Vector.js';
import type XYZ from 'ol/source/XYZ.js';
import type Style from 'ol/style/Style.js';
import { activeBasemap, type MapBasemap, type MapConfig } from './config';
import type { MapFeatureView, MapGeometry } from './geometry';
import {
	baseLayer,
	basemapSource,
	featureId,
	fromMapGeometry,
	themeStyles,
	toMapGeometry,
	watchTheme,
	type FeatureLook
} from './ol';

export type MapMode = 'select' | 'point' | 'line' | 'polygon' | 'modify' | 'delete';

export interface MapViewState {
	/** `[longitude, latitude]`. */
	center: [number, number];
	zoom: number;
}

export interface MapCallbacks {
	/** A click in select mode: the feature under the pointer, or null for empty map. */
	onselect?: (id: string | null) => void;
	/** A click on a feature in delete mode. */
	ondeleterequest?: (id: string) => void;
	ondrawend?: (geometry: MapGeometry) => void;
	/** Whether a drawing is in progress, for the undo and cancel controls. */
	ondrawingchange?: (drawing: boolean) => void;
	onmodify?: (id: string, geometry: MapGeometry) => void;
	onviewchange?: (view: MapViewState) => void;
}

export interface MapOptions {
	config: MapConfig;
	view: MapViewState;
	/** False for the small read only map: no panning, zooming or editing. */
	interactive: boolean;
	callbacks?: MapCallbacks;
}

const DRAW_TYPES = { point: 'Point', line: 'LineString', polygon: 'Polygon' } as const;

/** Pixels around the pointer that still count as hitting a feature; fingers need room. */
const HIT_TOLERANCE = 8;
const SNAP_TOLERANCE = 12;

/** The largest zoom used when fitting the view, so a single point does not zoom in all the way. */
const FIT_MAX_ZOOM = 17;

/**
 * Owns one OpenLayers map: the tile layer, the notes' features, the sketch of a drawing, and the
 * interactions of the current mode. Svelte components drive it through its methods and hear back
 * through callbacks; OpenLayers objects never enter Svelte state.
 */
export class MapController {
	readonly map: OlMap;
	private readonly tileLayer: TileLayer<XYZ>;
	private readonly features = new VectorSource<Feature<Geometry>>();
	private readonly sketch = new VectorSource<Feature<Geometry>>();
	private readonly featureLayer: VectorLayer<VectorSource<Feature<Geometry>>>;
	private readonly callbacks: MapCallbacks;
	private styles: Record<FeatureLook, Style>;
	private selectedId: string | null = null;
	private mode: MapMode = 'select';
	private draw: Draw | null = null;
	private modify: Modify | null = null;
	private snap: Snap | null = null;
	private readonly listeners: EventsKey[] = [];
	private readonly stopWatchingTheme: () => void;
	/** Geometries as last sent, so a sync only touches features that changed. */
	private readonly known = new Map<string, string>();

	constructor(target: HTMLElement, options: MapOptions) {
		this.callbacks = options.callbacks ?? {};
		this.styles = themeStyles();

		this.featureLayer = new VectorLayer({
			source: this.features,
			style: (feature) =>
				featureId(feature as Feature) === this.selectedId
					? this.styles.selected
					: this.styles.feature
		});
		const sketchLayer = new VectorLayer({
			source: this.sketch,
			style: () => this.styles.sketch
		});

		const basemap = activeBasemap(options.config);
		this.tileLayer = baseLayer(basemap);

		this.map = new OlMap({
			target,
			layers: [this.tileLayer, this.featureLayer, sketchLayer],
			view: new View({
				center: fromLonLat(options.view.center),
				zoom: options.view.zoom,
				maxZoom: basemap.maxZoom
			}),
			controls: defaultControls({
				zoom: options.interactive,
				rotate: false,
				attributionOptions: { collapsible: true, collapsed: true }
			}),
			interactions: options.interactive ? undefined : []
		});

		// Tests and styles can tell when the first frame is on screen; before it the map ignores input.
		this.map.once('postrender', () => {
			target.dataset.mapReady = 'true';
		});
		this.listeners.push(
			this.map.on('moveend', () => {
				const view = this.map.getView();
				const center = view.getCenter();
				const zoom = view.getZoom();
				if (center !== undefined && zoom !== undefined) {
					const [longitude, latitude] = toLonLat(center);
					this.callbacks.onviewchange?.({ center: [longitude, latitude], zoom });
				}
			}),
			this.map.on('click', (event) => this.onClick(event.pixel))
		);

		this.stopWatchingTheme = watchTheme(() => {
			this.styles = themeStyles();
			this.featureLayer.changed();
			this.sketch.changed();
		});
	}

	/** Brings the map's features in line with `list`, touching only what changed. */
	setFeatures(list: MapFeatureView[]): void {
		const wanted = new Set(list.map((item) => item.id));
		for (const feature of this.features.getFeatures()) {
			const id = featureId(feature);
			if (id === null || !wanted.has(id)) {
				this.features.removeFeature(feature);
				if (id !== null) {
					this.known.delete(id);
				}
			}
		}
		for (const item of list) {
			const serialized = JSON.stringify(item.geometry);
			const existing = this.features.getFeatureById(item.id);
			if (existing === null) {
				const feature = new Feature(fromMapGeometry(item.geometry));
				feature.setId(item.id);
				feature.set('noteId', item.noteId);
				this.features.addFeature(feature);
			} else if (this.known.get(item.id) !== serialized) {
				existing.setGeometry(fromMapGeometry(item.geometry));
				existing.set('noteId', item.noteId);
			}
			this.known.set(item.id, serialized);
		}
		if (this.selectedId !== null && !wanted.has(this.selectedId)) {
			this.select(null);
		}
	}

	setMode(mode: MapMode): void {
		this.removeEditing();
		this.mode = mode;

		if (mode === 'point' || mode === 'line' || mode === 'polygon') {
			this.draw = new Draw({
				source: this.sketch,
				type: DRAW_TYPES[mode],
				style: () => this.styles.sketch,
				snapTolerance: SNAP_TOLERANCE
			});
			this.draw.on('drawstart', () => {
				this.sketch.clear();
				this.callbacks.ondrawingchange?.(true);
			});
			this.draw.on('drawabort', () => this.callbacks.ondrawingchange?.(false));
			this.draw.on('drawend', (event) => {
				this.callbacks.ondrawingchange?.(false);
				const geometry = event.feature.getGeometry();
				if (geometry !== undefined) {
					this.callbacks.ondrawend?.(toMapGeometry(geometry));
				}
			});
			this.map.addInteraction(this.draw);
		}

		if (mode === 'modify') {
			this.modify = new Modify({ source: this.features, pixelTolerance: HIT_TOLERANCE });
			this.modify.on('modifyend', (event) => {
				for (const feature of event.features.getArray()) {
					const id = featureId(feature as Feature);
					const geometry = (feature as Feature).getGeometry();
					if (id !== null && geometry !== undefined) {
						this.callbacks.onmodify?.(id, toMapGeometry(geometry));
					}
				}
			});
			this.map.addInteraction(this.modify);
		}

		// Snap goes last: it has to see pointer moves before drawing and modifying do.
		if (this.draw !== null || this.modify !== null) {
			this.snap = new Snap({ source: this.features, pixelTolerance: SNAP_TOLERANCE });
			this.map.addInteraction(this.snap);
		}
	}

	/** Removes the last vertex of the drawing in progress; with none left the drawing ends. */
	undoVertex(): void {
		this.draw?.removeLastPoint();
	}

	cancelDrawing(): void {
		this.draw?.abortDrawing();
	}

	/** Shows a finished drawing that waits for a note. */
	showSketch(geometry: MapGeometry | null): void {
		this.sketch.clear();
		if (geometry !== null) {
			this.sketch.addFeature(new Feature(fromMapGeometry(geometry)));
		}
	}

	/** Puts a feature's geometry back after the server refused a change. */
	restoreGeometry(id: string, geometry: MapGeometry): void {
		this.features.getFeatureById(id)?.setGeometry(fromMapGeometry(geometry));
		this.known.set(id, JSON.stringify(geometry));
	}

	select(id: string | null): void {
		this.selectedId = id;
		this.featureLayer.changed();
	}

	/** Fits the view to the given features, or to all of them. */
	fit(ids?: string[], options: { padding?: number; animate?: boolean } = {}): void {
		const padding = options.padding ?? 48;
		const extent = createEmpty();
		for (const feature of this.features.getFeatures()) {
			const id = featureId(feature);
			const geometry = feature.getGeometry();
			if (
				geometry !== undefined &&
				(ids === undefined || (id !== null && ids.includes(id)))
			) {
				extend(extent, geometry.getExtent());
			}
		}
		if (isEmpty(extent)) {
			return;
		}
		this.map.getView().fit(extent, {
			padding: [padding, padding, padding, padding],
			maxZoom: FIT_MAX_ZOOM,
			duration: options.animate === false ? 0 : 250
		});
	}

	centerOn(center: [number, number], zoom: number): void {
		this.map.getView().animate({ center: fromLonLat(center), zoom, duration: 400 });
	}

	/** Shows another basemap; the view keeps its place but cannot zoom past the basemap's tiles. */
	setBasemap(basemap: MapBasemap): void {
		this.tileLayer.setSource(basemapSource(basemap));
		this.map.getView().setMaxZoom(basemap.maxZoom);
	}

	/** Recalculates the map size after its container changed without a resize the map could see. */
	updateSize(): void {
		this.map.updateSize();
	}

	destroy(): void {
		this.removeEditing();
		unByKey(this.listeners);
		this.stopWatchingTheme();
		this.map.setTarget(undefined);
		this.map.dispose();
	}

	private removeEditing(): void {
		for (const interaction of [this.snap, this.draw, this.modify]) {
			if (interaction !== null) {
				this.map.removeInteraction(interaction);
			}
		}
		if (this.draw !== null) {
			this.callbacks.ondrawingchange?.(false);
		}
		this.snap = null;
		this.draw = null;
		this.modify = null;
	}

	private onClick(pixel: number[]): void {
		if (this.mode !== 'select' && this.mode !== 'delete') {
			return;
		}
		const [first] = this.map.getFeaturesAtPixel(pixel, {
			layerFilter: (layer) => layer === this.featureLayer,
			hitTolerance: HIT_TOLERANCE
		});
		const hit = first === undefined ? null : featureId(first as Feature);
		if (this.mode === 'select') {
			this.callbacks.onselect?.(hit);
		} else if (hit !== null) {
			this.callbacks.ondeleterequest?.(hit);
		}
	}
}
