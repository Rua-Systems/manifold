// The arithmetic of the image editor, kept apart from the canvas so it can be tested: the colour
// changes applied to every pixel, the size of a turned image, crops and the name of the copy.

export type ImageFilter = 'none' | 'grayscale' | 'sepia';

/** Each from -100 to 100; 0 changes nothing. */
export interface Adjustments {
	brightness: number;
	contrast: number;
	saturation: number;
	filter: ImageFilter;
}

export const NO_ADJUSTMENTS: Adjustments = {
	brightness: 0,
	contrast: 0,
	saturation: 0,
	filter: 'none'
};

export type Rotation = 0 | 90 | 180 | 270;

/** A part of the turned image, as fractions of its width and height. */
export interface CropRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export const FULL_CROP: CropRect = { x: 0, y: 0, width: 1, height: 1 };

export interface PixelRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export function hasAdjustments(adjustments: Adjustments): boolean {
	return (
		adjustments.brightness !== 0 ||
		adjustments.contrast !== 0 ||
		adjustments.saturation !== 0 ||
		adjustments.filter !== 'none'
	);
}

/**
 * Changes RGBA pixels in place: brightness, then contrast around the middle grey, then saturation
 * towards the pixel's own grey, then the filter. Alpha stays. The array clamps and rounds itself.
 */
export function adjustPixels(data: Uint8ClampedArray, adjustments: Adjustments): void {
	const shift = adjustments.brightness * 2.55;
	// The usual contrast curve for an offset of -255 to 255, kept off its pole at 259.
	const offset = adjustments.contrast * 2.55;
	const contrast = (259 * (offset + 255)) / (255 * (259 - offset));
	const saturation = 1 + adjustments.saturation / 100;

	for (let index = 0; index < data.length; index += 4) {
		let red = contrast * (data[index] + shift - 128) + 128;
		let green = contrast * (data[index + 1] + shift - 128) + 128;
		let blue = contrast * (data[index + 2] + shift - 128) + 128;

		const grey = 0.299 * red + 0.587 * green + 0.114 * blue;
		red = grey + (red - grey) * saturation;
		green = grey + (green - grey) * saturation;
		blue = grey + (blue - grey) * saturation;

		if (adjustments.filter === 'grayscale') {
			const level = 0.299 * red + 0.587 * green + 0.114 * blue;
			red = level;
			green = level;
			blue = level;
		} else if (adjustments.filter === 'sepia') {
			const sepiaRed = 0.393 * red + 0.769 * green + 0.189 * blue;
			const sepiaGreen = 0.349 * red + 0.686 * green + 0.168 * blue;
			const sepiaBlue = 0.272 * red + 0.534 * green + 0.131 * blue;
			red = sepiaRed;
			green = sepiaGreen;
			blue = sepiaBlue;
		}

		data[index] = red;
		data[index + 1] = green;
		data[index + 2] = blue;
	}
}

/** A quarter turn to the right for 1, to the left for -1. */
export function turn(rotation: Rotation, direction: 1 | -1): Rotation {
	const next = (rotation + direction * 90 + 360) % 360;
	if (next === 90 || next === 180 || next === 270) {
		return next;
	}
	return 0;
}

/** The size of an image after it was turned. */
export function orientedSize(
	width: number,
	height: number,
	rotation: Rotation
): { width: number; height: number } {
	if (rotation === 90 || rotation === 270) {
		return { width: height, height: width };
	}
	return { width, height };
}

/** A crop in whole pixels of an image of this size, at least one pixel wide and high. */
export function cropPixels(crop: CropRect, width: number, height: number): PixelRect {
	const left = Math.min(Math.max(Math.round(crop.x * width), 0), width - 1);
	const top = Math.min(Math.max(Math.round(crop.y * height), 0), height - 1);
	const right = Math.min(Math.max(Math.round((crop.x + crop.width) * width), left + 1), width);
	const bottom = Math.min(Math.max(Math.round((crop.y + crop.height) * height), top + 1), height);
	return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The crop between two points given as fractions, in either order; null for a tiny one. */
export function cropBetween(
	start: { x: number; y: number },
	end: { x: number; y: number }
): CropRect | null {
	const clamp = (value: number) => Math.min(Math.max(value, 0), 1);
	const x = clamp(Math.min(start.x, end.x));
	const y = clamp(Math.min(start.y, end.y));
	const width = clamp(Math.max(start.x, end.x)) - x;
	const height = clamp(Math.max(start.y, end.y)) - y;
	// A click without a drag would leave a speck; it is not taken as a crop.
	if (width < 0.02 || height < 0.02) {
		return null;
	}
	return { x, y, width, height };
}

/** The type an edited image is saved as: its own, but PNG for a GIF, of which only a frame is kept. */
export function exportType(mimeType: string): 'image/png' | 'image/jpeg' | 'image/webp' {
	if (mimeType === 'image/jpeg' || mimeType === 'image/webp') {
		return mimeType;
	}
	return 'image/png';
}

const EXTENSIONS: Record<'image/png' | 'image/jpeg' | 'image/webp', string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp'
};

/** The name of the copy, such as `photo (edited).jpg`, with the extension of its type. */
export function editedName(
	name: string,
	suffix: string,
	type: 'image/png' | 'image/jpeg' | 'image/webp'
): string {
	const dot = name.lastIndexOf('.');
	let base = name;
	if (dot > 0) {
		base = name.slice(0, dot);
	}
	return `${base} (${suffix}).${EXTENSIONS[type]}`;
}
