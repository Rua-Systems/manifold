import type { MapViewState } from './controller';

// The last map view is kept per browser. Storage can be missing or refuse access (private
// windows, blocked site data), which only means the map opens on the default view.

const STORAGE_KEY = 'manifold.map.view';

function isViewState(value: unknown): value is MapViewState {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const { center, zoom } = value as Partial<MapViewState>;
	return (
		Array.isArray(center) &&
		center.length === 2 &&
		center.every((part) => typeof part === 'number' && Number.isFinite(part)) &&
		typeof zoom === 'number' &&
		Number.isFinite(zoom)
	);
}

export function loadMapView(): MapViewState | null {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored === null) {
			return null;
		}
		const parsed: unknown = JSON.parse(stored);
		return isViewState(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

export function saveMapView(view: MapViewState): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(view));
	} catch {
		// Not saved: the next visit starts from the default view.
	}
}
