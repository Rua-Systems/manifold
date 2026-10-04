/** A tile source the map can show beneath the notes' geometries. */
export interface MapBasemap {
	/** Null for the instance's own source from `MAP_TILE_URL`. */
	id: string | null;
	/** Empty for the instance's own source, which the page names itself. */
	name: string;
	/** XYZ template, for example `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. */
	url: string;
	/** HTML for the attribution control: trusted configuration, or the owner's text escaped. */
	attribution: string;
	maxZoom: number;
}

/** How the map starts: its basemaps and the view used when the browser saved none. */
export interface MapConfig {
	/** The instance's own basemap first, then the owner's in their order. */
	basemaps: MapBasemap[];
	/** The basemap in use, null for the instance's own. */
	basemapId: string | null;
	/** `[longitude, latitude]`. */
	center: [number, number];
	zoom: number;
}

/** The basemap the map shows: the one in use, or the instance's own when that one is gone. */
export function activeBasemap(config: MapConfig, id: string | null = config.basemapId): MapBasemap {
	return config.basemaps.find((basemap) => basemap.id === id) ?? config.basemaps[0];
}
