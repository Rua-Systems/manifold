/** How the map starts: the tile source and the view used when the browser saved none. */
export interface MapConfig {
	/** XYZ template, for example `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. */
	tileUrl: string;
	/** Trusted HTML from the instance configuration, shown in the attribution control. */
	attribution: string;
	/** `[longitude, latitude]`. */
	center: [number, number];
	zoom: number;
}
