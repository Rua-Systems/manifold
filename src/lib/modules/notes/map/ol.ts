import type { Feature } from 'ol';
import { asArray } from 'ol/color.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import type { Geometry } from 'ol/geom.js';
import TileLayer from 'ol/layer/Tile.js';
import XYZ from 'ol/source/XYZ.js';
import CircleStyle from 'ol/style/Circle.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Style from 'ol/style/Style.js';
import 'ol/ol.css';
import type { MapBasemap } from './config';
import type { MapGeometry } from './geometry';

// OpenLayers pieces shared by the map page and the small map on the note page. The view uses
// EPSG:3857; everything stored or sent uses EPSG:4326 GeoJSON.

export const geoJson = new GeoJSON({
	dataProjection: 'EPSG:4326',
	featureProjection: 'EPSG:3857'
});

export function toMapGeometry(geometry: Geometry): MapGeometry {
	return geoJson.writeGeometryObject(geometry, { decimals: 7, rightHanded: true }) as MapGeometry;
}

export function fromMapGeometry(geometry: MapGeometry): Geometry {
	return geoJson.readGeometry(geometry);
}

export function basemapSource(basemap: MapBasemap): XYZ {
	return new XYZ({
		url: basemap.url,
		attributions: basemap.attribution,
		maxZoom: basemap.maxZoom
	});
}

export function baseLayer(basemap: MapBasemap): TileLayer<XYZ> {
	return new TileLayer({ source: basemapSource(basemap) });
}

export type FeatureLook = 'feature' | 'selected' | 'sketch';

const COLOR_TOKENS: Record<FeatureLook, string> = {
	feature: '--color-map-feature',
	selected: '--color-map-selected',
	sketch: '--color-map-sketch'
};

function token(name: string): string {
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function withAlpha(color: string, alpha: number): number[] {
	const [red, green, blue] = asArray(color);
	return [red, green, blue, alpha];
}

/**
 * Feature styles in the theme's colours. Canvas styles cannot read CSS variables, so the colours
 * are read once here and again whenever the theme changes.
 */
export function themeStyles(): Record<FeatureLook, Style> {
	const outline = token('--color-surface') || 'white';
	const build = (look: FeatureLook, width: number): Style => {
		const color = token(COLOR_TOKENS[look]) || 'black';
		return new Style({
			fill: new Fill({ color: withAlpha(color, 0.18) }),
			stroke: new Stroke({ color, width }),
			image: new CircleStyle({
				radius: width + 4,
				fill: new Fill({ color }),
				stroke: new Stroke({ color: outline, width: 2 })
			})
		});
	};
	return {
		feature: build('feature', 2.5),
		selected: build('selected', 3.5),
		sketch: build('sketch', 2.5)
	};
}

/** Calls `onchange` when the theme attribute on the root element changes. */
export function watchTheme(onchange: () => void): () => void {
	const observer = new MutationObserver(onchange);
	observer.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ['data-theme']
	});
	return () => observer.disconnect();
}

export function featureId(feature: Feature): string | null {
	const id = feature.getId();
	return typeof id === 'string' ? id : null;
}
