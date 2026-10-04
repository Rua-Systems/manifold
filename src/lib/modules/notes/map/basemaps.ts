import { m } from '$lib/paraglide/messages.js';
import { URL_MAX_LENGTH } from '$lib/schemas/rules';
import type { FieldErrors } from '$lib/types/validation';
import { z } from 'zod';

// Rules for the basemaps the owner adds, shared by the settings form, its actions and the API.

export const BASEMAP_NAME_MAX_LENGTH = 60;
export const BASEMAP_ATTRIBUTION_MAX_LENGTH = 300;
export const BASEMAP_MAX_ZOOM = 22;
export const BASEMAP_DEFAULT_MAX_ZOOM = 19;

/** The placeholders a template needs, as the form's hint and messages show them. */
export const TILE_PLACEHOLDERS = '{z}, {x}, {y}';

/** The placeholders OpenLayers fills in an XYZ template: `{z}`, `{x}`, `{y}`, `{-y}`, `{a-c}`, `{1-4}`. */
const PLACEHOLDER = /\{(z|x|y|-y|[a-z]-[a-z]|\d-\d)\}/g;

/**
 * Whether the value is an https XYZ template with `{z}`, `{x}` and `{y}` or `{-y}`. Https only,
 * because the content security policy loads images from no other scheme; no credentials in the
 * address, since every request would carry them in the clear in the browser's history.
 */
export function isTileTemplate(value: string): boolean {
	if (!value.includes('{z}') || !value.includes('{x}')) {
		return false;
	}
	if (!value.includes('{y}') && !value.includes('{-y}')) {
		return false;
	}
	// A subdomain range becomes its first letter, so the host stays a valid name.
	const filled = value.replace(PLACEHOLDER, (_match, name: string) => {
		if (name.length === 3 && name[1] === '-') {
			return name[0];
		}
		return '0';
	});
	if (filled.includes('{') || filled.includes('}')) {
		return false;
	}
	try {
		const url = new URL(filled);
		return url.protocol === 'https:' && url.username === '' && url.password === '';
	} catch {
		return false;
	}
}

export const basemapNameSchema = z
	.string()
	.trim()
	.min(1, { error: () => m.validation_required() })
	.max(BASEMAP_NAME_MAX_LENGTH, {
		error: () => m.validation_max_length({ max: BASEMAP_NAME_MAX_LENGTH })
	});

export const basemapUrlSchema = z
	.string()
	.trim()
	.min(1, { error: () => m.validation_required() })
	.max(URL_MAX_LENGTH, { error: () => m.validation_max_length({ max: URL_MAX_LENGTH }) })
	// Leaflet's `{s}` for subdomains is common in copied addresses; OpenLayers spells it `{a-c}`.
	.transform((value) => value.replaceAll('{s}', '{a-c}'))
	.refine(isTileTemplate, {
		error: () => m.validation_basemap_url({ placeholders: TILE_PLACEHOLDERS })
	});

export const basemapAttributionSchema = z
	.string()
	.trim()
	.max(BASEMAP_ATTRIBUTION_MAX_LENGTH, {
		error: () => m.validation_max_length({ max: BASEMAP_ATTRIBUTION_MAX_LENGTH })
	});

const zoomError = () => m.validation_basemap_zoom({ max: BASEMAP_MAX_ZOOM });

/**
 * An empty field is a missing value, not the zero that coercing it would give. A bound number
 * input reports an empty field as null.
 */
function blankAsMissing(value: unknown): unknown {
	if (value === null || (typeof value === 'string' && value.trim() === '')) {
		return undefined;
	}
	return value;
}

/** Forms send the zoom as text and the API as a number; both arrive here. */
export const basemapMaxZoomSchema = z.preprocess(
	blankAsMissing,
	z.coerce
		.number({ error: zoomError })
		.int({ error: zoomError })
		.min(0, { error: zoomError })
		.max(BASEMAP_MAX_ZOOM, { error: zoomError })
);

export const basemapSchema = z.object({
	name: basemapNameSchema,
	url: basemapUrlSchema,
	attribution: basemapAttributionSchema,
	maxZoom: basemapMaxZoomSchema
});

export type BasemapInput = z.infer<typeof basemapSchema>;

/** A basemap the owner added, as stored. */
export interface Basemap {
	id: string;
	name: string;
	url: string;
	attribution: string;
	maxZoom: number;
	inUse: boolean;
	position: number;
}

export type BasemapsAction = 'create' | 'update' | 'delete' | 'move' | 'use';

/** What the settings page's form actions answer. */
export interface BasemapsFormState {
	action: BasemapsAction;
	success: boolean;
	message: string;
	errors: FieldErrors;
}
